/**
 * Seeds a load-test dataset into whatever DATABASE_URL points at.
 *
 * Deliberately NOT wired into `npm run db:seed`: it writes several thousand
 * rows and truncates its own prefix first, so it must be aimed at a throwaway
 * database. It refuses to run against a database whose name lacks `perf`.
 *
 *   DATABASE_URL=postgresql://...:55432/ragen_perf npx tsx perf/seed-load.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { getStorageProvider } from '@ragenai/storage';

import {
  SCALE,
  PRIMARY_ORG_ID,
  SECOND_ORG_ID,
  PASSWORD,
  USERS,
  TEAMS,
  TEAM_MEMBERSHIPS,
  FOLDERS,
  FILES,
  SECOND_ORG_FILE,
  DOCUMENTS,
  PROJECTS,
} from './fixture.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}
if (!/perf/.test(new URL(connectionString).pathname)) {
  throw new Error(
    `Refusing to seed load data into "${new URL(connectionString).pathname}" — ` +
      'point DATABASE_URL at a database with "perf" in its name.',
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/** Deterministic PRNG so two runs produce the same dataset. */
let seed = 1337;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

const bulkOrgIds = Array.from(
  { length: SCALE.organizations - 2 },
  (_, i) => `perf-org-bulk-${i + 1}`,
);
const allOrgIds = [PRIMARY_ORG_ID, SECOND_ORG_ID, ...bulkOrgIds];

/** Stable v4-shaped uuid from a counter, so bulk rows keep uuid columns valid. */
const uuid = (bucket: number, n: number) =>
  `0e4f${bucket.toString(16).padStart(4, '0')}-0000-4000-8000-${n
    .toString(16)
    .padStart(12, '0')}`;

async function wipe() {
  console.log('Wiping previous perf rows...');
  // Child-to-parent. Everything is reachable from the orgs this harness owns,
  // so scoping on those ids is enough — and keeps us off any real row.
  const orgs = { in: allOrgIds };
  await prisma.documentPermission.deleteMany({
    where: {
      OR: [
        { file: { organizationId: orgs } },
        { folder: { organizationId: orgs } },
      ],
    },
  });
  await prisma.projectPermission.deleteMany({
    where: { project: { organizationId: orgs } },
  });
  await prisma.message.deleteMany({
    where: { thread: { organizationId: orgs } },
  });
  await prisma.thread.deleteMany({ where: { organizationId: orgs } });
  await prisma.documentVersion.deleteMany({ where: { organizationId: orgs } });
  await prisma.userDocument.deleteMany({ where: { organizationId: orgs } });
  await prisma.userFile.deleteMany({ where: { organizationId: orgs } });
  await prisma.documentFolder.deleteMany({ where: { organizationId: orgs } });
  await prisma.project.deleteMany({ where: { organizationId: orgs } });
  await prisma.teamMember.deleteMany({
    where: { team: { organizationId: orgs } },
  });
  await prisma.team.deleteMany({ where: { organizationId: orgs } });
  await prisma.organizationSettings.deleteMany({
    where: { organizationId: orgs },
  });
  await prisma.member.deleteMany({ where: { organizationId: orgs } });
  await prisma.organization.deleteMany({ where: { id: orgs } });
  await prisma.account.deleteMany({
    where: { userId: { startsWith: 'perf-' } },
  });
  await prisma.session.deleteMany({
    where: { userId: { startsWith: 'perf-' } },
  });
  await prisma.user.deleteMany({ where: { id: { startsWith: 'perf-' } } });
  console.log('Wipe complete.');
}

async function seedAll() {
  const t0 = Date.now();
  const hashed = await hashPassword(PASSWORD);

  // ---- organizations -------------------------------------------------------
  await prisma.organization.createMany({
    data: allOrgIds.map((id, i) => ({
      id,
      name: `Perf Org ${i}`,
      slug: id,
      vectorStore: 'qdrant',
      hasKnowledge: true,
    })),
  });
  await prisma.organizationSettings.createMany({
    data: allOrgIds.map((organizationId) => ({ organizationId })),
  });
  console.log(`Organizations: ${allOrgIds.length}`);

  // ---- users ---------------------------------------------------------------
  const namedUsers = Object.values(USERS);
  const bulkUsers = allOrgIds.flatMap((orgId, oi) =>
    Array.from({ length: SCALE.usersPerOrg }, (_, i) => ({
      id: `perf-user-${oi}-${i}`,
      email: `perf-u${oi}-${i}@ragen.test`,
      orgId,
    })),
  );

  await prisma.user.createMany({
    data: [
      ...namedUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.id.replace('perf-user-', ''),
        emailVerified: true,
        onboardingComplete: true,
        // Platform role stays 'user' for everyone: the matrix is about ORG
        // roles, and a platform admin would short-circuit the checks.
        role: 'user',
      })),
      ...bulkUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.id,
        emailVerified: true,
        onboardingComplete: true,
        role: 'user',
      })),
    ],
  });

  await prisma.account.createMany({
    data: [...namedUsers, ...bulkUsers].map((u) => ({
      id: `perf-acct-${u.id}`,
      userId: u.id,
      providerId: 'credential',
      // Better Auth 1.7 matches on providerId + issuer + accountId, and for a
      // local credential accountId is the user id. Seeding the row directly
      // means reproducing that, or sign-in silently finds no account.
      accountId: u.id,
      issuer: 'local:credential',
      password: hashed,
    })),
  });
  console.log(`Users: ${namedUsers.length + bulkUsers.length}`);

  // ---- members -------------------------------------------------------------
  await prisma.member.createMany({
    data: [
      ...namedUsers
        .filter((u) => u.id !== USERS.outsider.id)
        .map((u) => ({
          id: `perf-member-${u.id}`,
          organizationId: PRIMARY_ORG_ID,
          userId: u.id,
          role: u.role,
        })),
      {
        id: `perf-member-${USERS.outsider.id}`,
        organizationId: SECOND_ORG_ID,
        userId: USERS.outsider.id,
        role: 'owner',
      },
      ...bulkUsers.map((u, i) => ({
        id: `perf-member-bulk-${i}`,
        organizationId: u.orgId,
        userId: u.id,
        role: i % SCALE.usersPerOrg === 0 ? 'owner' : 'member',
      })),
    ],
  });

  // ---- teams ---------------------------------------------------------------
  await prisma.team.createMany({
    data: [
      ...Object.values(TEAMS).map((t) => ({
        id: t.id,
        name: t.name,
        organizationId: PRIMARY_ORG_ID,
      })),
      ...allOrgIds.flatMap((orgId, oi) =>
        Array.from({ length: SCALE.teamsPerOrg }, (_, i) => ({
          id: `perf-team-${oi}-${i}`,
          name: `Perf Team ${oi}-${i}`,
          organizationId: orgId,
        })),
      ),
    ],
  });

  await prisma.teamMember.createMany({
    data: [
      ...Object.entries(TEAM_MEMBERSHIPS).flatMap(([teamId, userIds]) =>
        userIds.map((userId) => ({
          id: `perf-tm-${teamId}-${userId}`,
          teamId,
          userId,
        })),
      ),
      // Spread bulk users across their own org's teams.
      ...bulkUsers.map((u, i) => ({
        id: `perf-tm-bulk-${i}`,
        teamId: `perf-team-${allOrgIds.indexOf(u.orgId)}-${i % SCALE.teamsPerOrg}`,
        userId: u.id,
      })),
    ],
  });
  console.log(
    `Teams: ${Object.keys(TEAMS).length + allOrgIds.length * SCALE.teamsPerOrg}`,
  );

  // ---- projects ------------------------------------------------------------
  await prisma.project.createMany({
    data: [
      {
        id: PROJECTS.primary.id,
        title: PROJECTS.primary.title,
        organizationId: PRIMARY_ORG_ID,
        ownerId: USERS.owner.id,
      },
      {
        id: PROJECTS.second.id,
        title: PROJECTS.second.title,
        organizationId: SECOND_ORG_ID,
        ownerId: USERS.outsider.id,
      },
      ...bulkOrgIds.map((orgId, i) => ({
        id: uuid(0x0c, i + 10),
        title: `Perf Bulk Project ${i}`,
        organizationId: orgId,
      })),
    ],
  });

  // ---- folders -------------------------------------------------------------
  await prisma.documentFolder.createMany({
    data: [
      {
        id: FOLDERS.legacy.id,
        name: FOLDERS.legacy.name,
        organizationId: PRIMARY_ORG_ID,
        path: '/perf-legacy',
      },
      {
        id: FOLDERS.alicePrivate.id,
        name: FOLDERS.alicePrivate.name,
        organizationId: PRIMARY_ORG_ID,
        ownerId: USERS.alice.id,
        path: '/perf-alice-private',
      },
      {
        id: FOLDERS.engTeam.id,
        name: FOLDERS.engTeam.name,
        organizationId: PRIMARY_ORG_ID,
        teamId: TEAMS.engineering.id,
        path: '/perf-eng-team',
      },
      {
        id: FOLDERS.aliceSharedToBob.id,
        name: FOLDERS.aliceSharedToBob.name,
        organizationId: PRIMARY_ORG_ID,
        ownerId: USERS.alice.id,
        path: '/perf-alice-shared',
      },
      ...allOrgIds.flatMap((orgId, oi) =>
        Array.from({ length: SCALE.foldersPerOrg }, (_, i) => ({
          id: uuid(0x0f10 + oi, i + 100),
          name: `Perf Folder ${oi}-${i}`,
          organizationId: orgId,
          path: `/perf-bulk-${oi}-${i}`,
        })),
      ),
    ],
  });

  // ---- named files ---------------------------------------------------------
  await prisma.userFile.createMany({
    data: [
      ...Object.values(FILES).map((f) => ({
        id: f.id,
        organizationId: PRIMARY_ORG_ID,
        fileName: f.name,
        fileSize: 2048,
        fileType: 'TEXT' as const,
        isUploaded: true,
        embeddingStatus: 'COMPLETED' as const,
        parsingStatus: 'COMPLETED' as const,
        ownerId: f.ownerId,
        folderId: f.folderId,
        projectId: PROJECTS.primary.id,
        fileExtension: 'txt',
        fileMimeType: 'text/plain',
        thumbnailS3Key: 'thumbnailS3Key' in f ? f.thumbnailS3Key : null,
      })),
      {
        id: SECOND_ORG_FILE.id,
        organizationId: SECOND_ORG_ID,
        fileName: SECOND_ORG_FILE.name,
        fileSize: 2048,
        fileType: 'TEXT' as const,
        isUploaded: true,
        embeddingStatus: 'COMPLETED' as const,
        parsingStatus: 'COMPLETED' as const,
        ownerId: SECOND_ORG_FILE.ownerId,
        projectId: PROJECTS.second.id,
        fileExtension: 'txt',
        fileMimeType: 'text/plain',
      },
    ],
  });

  // ---- named share grants --------------------------------------------------
  await prisma.documentPermission.createMany({
    data: [
      {
        resourceType: 'file',
        fileId: FILES.aliceSharedToBobUser.id,
        granteeType: 'user',
        granteeId: USERS.bob.id,
        permission: 'view',
        grantedBy: USERS.alice.id,
      },
      {
        resourceType: 'file',
        fileId: FILES.aliceSharedToEngTeam.id,
        granteeType: 'team',
        granteeId: TEAMS.engineering.id,
        permission: 'view',
        grantedBy: USERS.alice.id,
      },
      {
        resourceType: 'folder',
        folderId: FOLDERS.aliceSharedToBob.id,
        granteeType: 'user',
        granteeId: USERS.bob.id,
        permission: 'view',
        grantedBy: USERS.alice.id,
      },
    ],
  });

  // ---- named documents -----------------------------------------------------
  await prisma.userDocument.createMany({
    data: [
      {
        id: DOCUMENTS.alicePrivate.id,
        organizationId: PRIMARY_ORG_ID,
        title: DOCUMENTS.alicePrivate.title,
        content: DOCUMENTS.alicePrivate.content,
        fileId: DOCUMENTS.alicePrivate.fileId,
        projectId: PROJECTS.primary.id,
      },
      {
        id: DOCUMENTS.secondOrg.id,
        organizationId: SECOND_ORG_ID,
        title: DOCUMENTS.secondOrg.title,
        content: DOCUMENTS.secondOrg.content,
        fileId: DOCUMENTS.secondOrg.fileId,
        projectId: PROJECTS.second.id,
      },
    ],
  });
  await prisma.documentVersion.createMany({
    data: [
      {
        documentId: DOCUMENTS.alicePrivate.id,
        organizationId: PRIMARY_ORG_ID,
        versionNumber: 1,
        content: DOCUMENTS.alicePrivate.content,
        title: DOCUMENTS.alicePrivate.title,
        changeType: 'UPLOAD',
        authorId: USERS.alice.id,
        isActive: true,
      },
      {
        documentId: DOCUMENTS.secondOrg.id,
        organizationId: SECOND_ORG_ID,
        versionNumber: 1,
        content: DOCUMENTS.secondOrg.content,
        title: DOCUMENTS.secondOrg.title,
        changeType: 'UPLOAD',
        authorId: USERS.outsider.id,
        isActive: true,
      },
    ],
  });

  // ---- bulk files ----------------------------------------------------------
  const fileTypes = ['TEXT', 'PDF', 'DOCX', 'MARKDOWN', 'CSV'] as const;
  const embedStatuses = [
    'COMPLETED',
    'COMPLETED',
    'COMPLETED',
    'FAILED',
    'STARTED',
  ] as const;
  const bulkFiles: {
    id: string;
    organizationId: string;
    fileName: string;
    fileSize: number;
    fileType: (typeof fileTypes)[number];
    isUploaded: boolean;
    embeddingStatus: (typeof embedStatuses)[number];
    parsingStatus: 'COMPLETED';
    ownerId: string | null;
    folderId: string | null;
    projectId: string | null;
    fileExtension: string;
    fileMimeType: string;
  }[] = [];

  for (const [oi, orgId] of allOrgIds.entries()) {
    const orgUsers = bulkUsers
      .filter((u) => u.orgId === orgId)
      .map((u) => u.id);
    const orgFolders = Array.from({ length: SCALE.foldersPerOrg }, (_, i) =>
      uuid(0x0f10 + oi, i + 100),
    );
    for (let i = 0; i < SCALE.filesPerOrg; i++) {
      // A slice of files stay unowned, mirroring the pre-ownership rows that
      // still exist in production and are treated as org-wide.
      const unowned = i % 7 === 0;
      bulkFiles.push({
        id: uuid(0x1000 + oi, i + 1000),
        organizationId: orgId,
        fileName: `perf-bulk-${oi}-${i}.txt`,
        fileSize: 1024 + Math.floor(rand() * 4_000_000),
        fileType: pick(fileTypes),
        isUploaded: true,
        embeddingStatus: pick(embedStatuses),
        parsingStatus: 'COMPLETED',
        ownerId: unowned || orgUsers.length === 0 ? null : pick(orgUsers),
        folderId: i % 3 === 0 ? pick(orgFolders) : null,
        projectId: null,
        fileExtension: 'txt',
        fileMimeType: 'text/plain',
      });
    }
  }
  for (let i = 0; i < bulkFiles.length; i += 500) {
    await prisma.userFile.createMany({ data: bulkFiles.slice(i, i + 500) });
  }
  console.log(`Files: ${bulkFiles.length + Object.keys(FILES).length + 1}`);

  // ---- bulk share grants ---------------------------------------------------
  const grants: {
    resourceType: string;
    fileId: string | null;
    folderId: string | null;
    granteeType: string;
    granteeId: string;
    permission: string;
  }[] = [];
  const seen = new Set<string>();
  for (const [oi, orgId] of allOrgIds.entries()) {
    const orgUsers = bulkUsers
      .filter((u) => u.orgId === orgId)
      .map((u) => u.id);
    const orgTeams = Array.from(
      { length: SCALE.teamsPerOrg },
      (_, i) => `perf-team-${oi}-${i}`,
    );
    if (orgUsers.length === 0) {
      continue;
    }
    // Filtered once per org, not once per grant: at stress scale the inner
    // form was scanning every file in the dataset on every iteration.
    const orgFiles = bulkFiles.filter((f) => f.organizationId === orgId);
    for (let i = 0; i < SCALE.permissionsPerOrg; i++) {
      const toTeam = i % 3 === 0;
      const file = pick(orgFiles);
      const granteeId = toTeam ? pick(orgTeams) : pick(orgUsers);
      const key = `${file.id}:${toTeam ? 'team' : 'user'}:${granteeId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      grants.push({
        resourceType: 'file',
        fileId: file.id,
        folderId: null,
        granteeType: toTeam ? 'team' : 'user',
        granteeId,
        permission: i % 4 === 0 ? 'full' : 'view',
      });
    }
  }
  await prisma.documentPermission.createMany({ data: grants });
  console.log(`Share grants: ${grants.length + 3}`);

  // ---- threads + messages --------------------------------------------------
  const threads: {
    id: string;
    title: string;
    organizationId: string;
    userId: string;
    visitorId: string;
    projectId: string | null;
  }[] = [];
  for (const [oi, orgId] of allOrgIds.entries()) {
    const orgUsers = bulkUsers
      .filter((u) => u.orgId === orgId)
      .map((u) => u.id);
    if (orgUsers.length === 0) {
      continue;
    }
    for (let i = 0; i < SCALE.threadsPerOrg; i++) {
      const userId = pick(orgUsers);
      threads.push({
        id: uuid(0x2000 + oi, i + 2000),
        title: `Perf Thread ${oi}-${i}`,
        organizationId: orgId,
        userId,
        visitorId: userId,
        projectId: null,
      });
    }
  }
  await prisma.thread.createMany({ data: threads });

  // `ti` rather than threads.indexOf(t): the lookup made this quadratic, which
  // only shows up once the thread count is raised for a stress run.
  const messages = threads.flatMap((t, ti) =>
    Array.from({ length: SCALE.messagesPerThread }, (_, i) => ({
      id: uuid(0x3000, ti * SCALE.messagesPerThread + i + 3000),
      content:
        i % 2 === 0
          ? `Perf question ${i} with enough text to be a realistic prompt payload.`
          : `Perf answer ${i} with enough text to look like a real completion body.`,
      role: (i % 2 === 0 ? 'USER' : 'ASSISTANT') as 'USER' | 'ASSISTANT',
      threadId: t.id,
    })),
  );
  for (let i = 0; i < messages.length; i += 1000) {
    await prisma.message.createMany({ data: messages.slice(i, i + 1000) });
  }
  console.log(`Threads: ${threads.length}, Messages: ${messages.length}`);

  // ---- storage objects for the named files ---------------------------------
  // Through the same provider the app downloads with, and under the same
  // `<orgId>/<fileId>.<ext>` key it builds, so the download routes answer 200
  // for an authorised caller. Without this the by-id probes could not tell
  // "refused" (404) from "authorised but the object is missing" (500), and the
  // owner-can-download cases would pass only on a machine where someone had
  // placed the files by hand.
  const storage = getStorageProvider();
  const objects: [key: string, body: string][] = [];

  for (const f of Object.values(FILES)) {
    // The bodies of the files the matrix calls private carry a marker string,
    // so a leak in a response body is recognisable rather than just "some
    // bytes came back".
    const body =
      f.id === FILES.alicePrivate.id
        ? DOCUMENTS.alicePrivate.content
        : `content of ${f.name}`;
    objects.push([`${PRIMARY_ORG_ID}/${f.id}.txt`, body]);
    if ('thumbnailS3Key' in f && f.thumbnailS3Key) {
      objects.push([f.thumbnailS3Key, `thumbnail bytes for ${f.name}`]);
    }
  }
  objects.push([
    `${SECOND_ORG_ID}/${SECOND_ORG_FILE.id}.txt`,
    DOCUMENTS.secondOrg.content,
  ]);

  for (const [key, body] of objects) {
    await storage.upload(key, Buffer.from(`${body}\n`, 'utf8'));
  }
  console.log(`Storage objects: ${objects.length}`);

  console.log(`\nSeed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function main() {
  await wipe();
  await seedAll();

  const counts = {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    members: await prisma.member.count(),
    teams: await prisma.team.count(),
    teamMembers: await prisma.teamMember.count(),
    folders: await prisma.documentFolder.count(),
    files: await prisma.userFile.count(),
    documents: await prisma.userDocument.count(),
    permissions: await prisma.documentPermission.count(),
    threads: await prisma.thread.count(),
    messages: await prisma.message.count(),
  };
  console.log('\nRow counts:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
}

main()
  .catch((e) => {
    console.error('Perf seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
