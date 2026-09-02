/**
 * Shape of the load-test dataset, shared by the seed, the benchmark and the
 * access-control matrix.
 *
 * The scale knobs are deliberately separate from the *named* fixture below.
 * Bulk rows exist to make the queries do real work; the named rows are the
 * ones the permission matrix makes assertions about, so they must stay stable
 * and hand-readable.
 */

/**
 * Overridable so one harness can answer two different questions: the default
 * mirrors a realistic mid-size tenant, and `PERF_FILES_PER_ORG=5000` pushes a
 * single org hard enough to show where the access filter stops being free.
 */
const envInt = (name: string, fallback: number) => {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const SCALE = {
  /** Organizations, including the two the matrix reads. */
  organizations: 6,
  /** Users per bulk org (the primary org gets the named users on top). */
  usersPerOrg: 10,
  /** Teams per org. */
  teamsPerOrg: 3,
  /** Folders per org. */
  foldersPerOrg: 8,
  /** Files per org — the dominant row count. */
  filesPerOrg: envInt('PERF_FILES_PER_ORG', 120),
  /** Threads per org, each with messages. */
  threadsPerOrg: envInt('PERF_THREADS_PER_ORG', 40),
  /** Messages per thread. */
  messagesPerThread: 8,
  /** Share grants per org, spread over files and folders. */
  permissionsPerOrg: envInt('PERF_PERMISSIONS_PER_ORG', 60),
} as const;

/** Prefix every row this harness owns, so cleanup can never touch real data. */
export const PERF_PREFIX = 'perf-';

export const PRIMARY_ORG_ID = 'perf-org-primary';
export const SECOND_ORG_ID = 'perf-org-second';

export const PASSWORD = 'PerfTestPassword123!';

/**
 * Named users in the primary org. `role` is the *org* role (Member.role), not
 * the platform role — the two hierarchies are separate and conflating them is
 * the classic bug here.
 */
export const USERS = {
  owner: {
    id: 'perf-user-owner',
    email: 'perf-owner@ragen.test',
    role: 'owner',
  },
  admin: {
    id: 'perf-user-admin',
    email: 'perf-admin@ragen.test',
    role: 'admin',
  },
  alice: {
    id: 'perf-user-alice',
    email: 'perf-alice@ragen.test',
    role: 'member',
  },
  bob: { id: 'perf-user-bob', email: 'perf-bob@ragen.test', role: 'member' },
  carol: {
    id: 'perf-user-carol',
    email: 'perf-carol@ragen.test',
    role: 'member',
  },
  dave: { id: 'perf-user-dave', email: 'perf-dave@ragen.test', role: 'member' },
  /** Member of the *second* org only — every cross-tenant check uses this one. */
  outsider: {
    id: 'perf-user-outsider',
    email: 'perf-outsider@ragen.test',
    role: 'owner',
  },
} as const;

export const TEAMS = {
  /** alice + bob */
  engineering: { id: 'perf-team-engineering', name: 'Perf Engineering' },
  /** carol */
  marketing: { id: 'perf-team-marketing', name: 'Perf Marketing' },
} as const;

export const TEAM_MEMBERSHIPS: Record<string, string[]> = {
  [TEAMS.engineering.id]: [USERS.alice.id, USERS.bob.id],
  [TEAMS.marketing.id]: [USERS.carol.id],
};

export const FOLDERS = {
  /** No owner, no team — the legacy "everyone can see it" case. */
  legacy: { id: '0e4f0000-0000-4000-8000-00000000f001', name: 'Perf Legacy' },
  /** Owned by alice, shared with nobody. */
  alicePrivate: {
    id: '0e4f0000-0000-4000-8000-00000000f002',
    name: 'Perf Alice Private',
  },
  /** Bound to the engineering team via DocumentFolder.teamId. */
  engTeam: {
    id: '0e4f0000-0000-4000-8000-00000000f003',
    name: 'Perf Eng Team',
  },
  /** Owned by alice, granted to bob with an explicit folder permission. */
  aliceSharedToBob: {
    id: '0e4f0000-0000-4000-8000-00000000f004',
    name: 'Perf Alice Shared To Bob',
  },
} as const;

/**
 * The access-control fixture. `expected` lists exactly the named users who are
 * supposed to be able to read each file — every other named user must not be.
 * Org admins/owners are expected to see everything in their own org.
 */
export const FILES = {
  /** ownerId null: pre-ownership file, visible to the whole org. */
  legacyOrgWide: {
    id: '0e4f0000-0000-4000-8000-000000001001',
    name: 'perf-legacy-org-wide.txt',
    ownerId: null,
    folderId: FOLDERS.legacy.id,
    expected: [
      USERS.owner.id,
      USERS.admin.id,
      USERS.alice.id,
      USERS.bob.id,
      USERS.carol.id,
      USERS.dave.id,
    ],
  },
  /**
   * alice's, unshared. The tightest case.
   *
   * Carries a `thumbnailS3Key` because the thumbnail route is a separate
   * access-control surface, and it answers 404 for *everyone* when the column
   * is null — which would make the probe against it vacuously pass.
   */
  alicePrivate: {
    id: '0e4f0000-0000-4000-8000-000000001002',
    name: 'perf-alice-private.txt',
    ownerId: USERS.alice.id,
    folderId: FOLDERS.alicePrivate.id,
    thumbnailS3Key: 'perf-org-primary/perf-thumb-alice.png',
    expected: [USERS.owner.id, USERS.admin.id, USERS.alice.id],
  },
  /** alice's, granted to bob as an individual. */
  aliceSharedToBobUser: {
    id: '0e4f0000-0000-4000-8000-000000001003',
    name: 'perf-alice-shared-to-bob.txt',
    ownerId: USERS.alice.id,
    folderId: null,
    expected: [USERS.owner.id, USERS.admin.id, USERS.alice.id, USERS.bob.id],
  },
  /** alice's, granted to the engineering team — reaches bob through the team. */
  aliceSharedToEngTeam: {
    id: '0e4f0000-0000-4000-8000-000000001004',
    name: 'perf-alice-shared-to-eng.txt',
    ownerId: USERS.alice.id,
    folderId: null,
    expected: [USERS.owner.id, USERS.admin.id, USERS.alice.id, USERS.bob.id],
  },
  /** carol's, sitting in the engineering team folder. */
  carolInEngFolder: {
    id: '0e4f0000-0000-4000-8000-000000001005',
    name: 'perf-carol-in-eng-folder.txt',
    ownerId: USERS.carol.id,
    folderId: FOLDERS.engTeam.id,
    expected: [
      USERS.owner.id,
      USERS.admin.id,
      USERS.carol.id,
      USERS.alice.id,
      USERS.bob.id,
    ],
  },
  /** carol's, unshared — dave and bob must never reach this. */
  carolPrivate: {
    id: '0e4f0000-0000-4000-8000-000000001006',
    name: 'perf-carol-private.txt',
    ownerId: USERS.carol.id,
    folderId: null,
    expected: [USERS.owner.id, USERS.admin.id, USERS.carol.id],
  },
  /**
   * alice's, inside a folder granted to bob. Access is meant to be inherited
   * from the folder grant rather than sitting on the file.
   */
  aliceInFolderSharedToBob: {
    id: '0e4f0000-0000-4000-8000-000000001007',
    name: 'perf-alice-in-shared-folder.txt',
    ownerId: USERS.alice.id,
    folderId: FOLDERS.aliceSharedToBob.id,
    expected: [USERS.owner.id, USERS.admin.id, USERS.alice.id, USERS.bob.id],
  },
} as const;

/** Lives in the second org. No primary-org user may ever read it. */
export const SECOND_ORG_FILE = {
  id: '0e4f0000-0000-4000-8000-000000002001',
  name: 'perf-second-org.txt',
  ownerId: USERS.outsider.id,
} as const;

export const DOCUMENTS = {
  /** Attached to alicePrivate — the content side of the same access question. */
  alicePrivate: {
    id: '0e4f0000-0000-4000-8000-00000000d002',
    fileId: FILES.alicePrivate.id,
    title: 'Perf Alice Private Document',
    content: 'ALICE-PRIVATE-CONTENT-MARKER',
  },
  secondOrg: {
    id: '0e4f0000-0000-4000-8000-00000000d999',
    fileId: SECOND_ORG_FILE.id,
    title: 'Perf Second Org Document',
    content: 'SECOND-ORG-CONTENT-MARKER',
  },
} as const;

export const PROJECTS = {
  primary: {
    id: '0e4f0000-0000-4000-8000-00000000c001',
    title: 'Perf Primary Project',
  },
  second: {
    id: '0e4f0000-0000-4000-8000-00000000c002',
    title: 'Perf Second Project',
  },
} as const;

export const NAMED_PRIMARY_USER_IDS = [
  USERS.owner.id,
  USERS.admin.id,
  USERS.alice.id,
  USERS.bob.id,
  USERS.carol.id,
  USERS.dave.id,
];
