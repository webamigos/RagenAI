/* eslint-disable no-console */
/**
 * Demo seed: Nordwind Logistics, a fictional mid-size logistics company, in
 * Polish and in English — one organization per locale, with its own users —
 * so every screen of the product looks lived-in for screenshots.
 *
 *   DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_demo \
 *     npx tsx scripts/demo/seed-nordwind.ts --locale pl     # or en, or all
 *
 * scripts/demo/README.md has the setup, the logins and what is not seeded.
 *
 * **Modelled on `apps/web/e2e/seed/e2e-seed.ts`**: Better Auth rows written
 * with Prisma in the shape the library looks them up by, teardown in foreign
 * key order before every run, fixed ids so a re-seed lands on the same URLs.
 *
 * **Refuses any database but `ragen_demo` on this machine.** It deletes and
 * rewrites whole organizations, and the local `ragen` and `ragen_e2e`
 * databases sit on the same server.
 */
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import type { FeatureOverrides } from '@ragenai/platform-contracts';
import { hashPassword } from 'better-auth/crypto';

import {
  Prisma,
  PrismaClient,
} from '../../apps/web/src/generated/prisma/client.js';

import {
  citedIndexes,
  computedFindings,
  quoteHash,
  rng,
  stableUuid,
  validateContent,
  vehicleFileName,
  type BuiltPage,
} from './nordwind/build.js';
import { contentEn } from './nordwind/content-en.js';
import { contentPl } from './nordwind/content-pl.js';
import {
  ANALYTICS_DAYS,
  ASSISTANTS,
  DECISIONS,
  DEMO_PASSWORD,
  DOCS,
  EDGES,
  EMAIL_DOMAIN,
  EXTRACTION_FAILED_DOC,
  FOLDERS,
  PAGES,
  PEOPLE,
} from './nordwind/structure.js';
import type {
  AssistantKey,
  DemoContent,
  DemoThread,
  DemoThreadSource,
  DocKey,
  FolderKey,
  Locale,
  PersonKey,
  TeamKey,
} from './nordwind/types.js';

const CONTENT: Record<Locale, DemoContent> = { pl: contentPl, en: contentEn };

export const DEMO_DATABASE = 'ragen_demo';
export const PLATFORM_ADMIN_EMAIL = `platform-admin@${EMAIL_DOMAIN}`;
const PLATFORM_ADMIN_ID = 'nordwind-platform-admin';

const DAY = 86_400_000;

export function parseLocales(argv: readonly string[]): Locale[] {
  const at = argv.indexOf('--locale');
  const value = at >= 0 ? argv[at + 1] : 'all';
  if (value === 'pl' || value === 'en') {
    return [value];
  }
  if (value === 'all') {
    return ['pl', 'en'];
  }
  throw new Error(`--locale must be pl, en or all (got ${value ?? 'nothing'})`);
}

/** Only `ragen_demo`, only on this machine: this deletes whole organizations. */
export function assertDemoDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const database = parsed.pathname.replace(/^\//, '');
  if (
    !['localhost', '127.0.0.1', '::1'].includes(host) ||
    database !== DEMO_DATABASE
  ) {
    throw new Error(
      `Refusing to seed ${host}/${database}: the demo seed writes only to ${DEMO_DATABASE} on localhost.`,
    );
  }
}

export const orgIdFor = (locale: Locale): string => `nordwind-${locale}`;
export const userIdFor = (locale: Locale, person: PersonKey): string =>
  `nordwind-${locale}-${person}`;
export const emailFor = (content: DemoContent, person: PersonKey): string =>
  `${content.people[person].emailLocal}@${EMAIL_DOMAIN}`;

const MIME: Record<string, { ext: string; mime: string }> = {
  PDF: { ext: 'pdf', mime: 'application/pdf' },
  DOCX: {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  XLSX: {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  MARKDOWN: { ext: 'md', mime: 'text/markdown' },
  URL: { ext: 'html', mime: 'text/html' },
};

/** Model, and a rough USD price per million tokens (in, out), for the usage history. */
const PRICES: Record<string, [number, number]> = {
  'gpt-5.4': [2.5, 10],
  'claude-sonnet-4-6': [3, 15],
  'gemini-2.5-flash': [0.3, 2.5],
  'gpt-5.4-mini': [0.4, 1.6],
  'mistral-small-3.2': [0.1, 0.3],
  'qwen3-embedding-8b': [0.02, 0],
  'bge-multilingual-gemma2': [0.02, 0],
};

const cost = (model: string, input: number, output: number): number => {
  const [pin, pout] = PRICES[model] ?? [1, 4];
  return Number(((input * pin + output * pout) / 1_000_000).toFixed(6));
};

// ---------------------------------------------------------------------------

async function cleanup(
  prisma: PrismaClient,
  locale: Locale,
  content: DemoContent,
): Promise<void> {
  const orgId = orgIdFor(locale);
  const userIds = (Object.keys(PEOPLE) as PersonKey[]).map((p) =>
    userIdFor(locale, p),
  );
  const emails = (Object.keys(PEOPLE) as PersonKey[]).map((p) =>
    emailFor(content, p),
  );

  // Rows written by a seeded user in another org would block the user delete;
  // there are none by construction, but the where clauses below all scope to
  // this org so nothing else is touched.
  await prisma.message.deleteMany({
    where: { thread: { organizationId: orgId } },
  });
  await prisma.thread.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiUsage.deleteMany({ where: { organizationId: orgId } });
  await prisma.securityEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.notification.deleteMany({ where: { organizationId: orgId } });
  // Brain before files: a published page's file is a NO ACTION reference, and
  // decisions are NO ACTION on the page (the e2e seed's order, spec E10).
  await prisma.knowledgeFinding.deleteMany({
    where: { organizationId: orgId },
  });
  await prisma.knowledgeDecision.deleteMany({
    where: { organizationId: orgId },
  });
  await prisma.knowledgePage.deleteMany({ where: { organizationId: orgId } });
  await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
  await prisma.userDocument.deleteMany({ where: { organizationId: orgId } });
  // Assistant copies reference their knowledge-base original.
  await prisma.userFile.deleteMany({
    where: { organizationId: orgId, sourceFileId: { not: null } },
  });
  await prisma.userFile.deleteMany({ where: { organizationId: orgId } });
  await prisma.documentFolder.deleteMany({
    where: { organizationId: orgId, parentId: { not: null } },
  });
  await prisma.documentFolder.deleteMany({ where: { organizationId: orgId } });
  await prisma.apiKey.deleteMany({ where: { organizationId: orgId } });
  await prisma.project.deleteMany({ where: { organizationId: orgId } });
  await prisma.subscription.deleteMany({ where: { referenceId: orgId } });
  await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
  // Settings, members, teams, connectors, guardrails and Brain's remaining
  // rows cascade from the organization.
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({
    where: { OR: [{ id: { in: userIds } }, { email: { in: emails } }] },
  });
}

// ---------------------------------------------------------------------------

interface Ctx {
  prisma: PrismaClient;
  locale: Locale;
  c: DemoContent;
  orgId: string;
  now: number;
  uid: (p: PersonKey) => string;
  teamId: (t: TeamKey) => string;
  folderIds: Record<FolderKey, string>;
  fileIds: Record<DocKey, string>;
  versionIds: Record<DocKey, string[]>;
  projectIds: Record<AssistantKey | 'default', string>;
  pageIds: Record<string, number>;
  pagePublicIds: Record<string, string>;
  vehicleFileIds: Record<string, string>;
  sourceIds: Record<string, number[]>;
  counts: Record<string, number>;
}

const ago = (ctx: Ctx, days: number, hour = 10, minute = 0): Date => {
  const d = new Date(ctx.now - days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const bump = (ctx: Ctx, table: string, n = 1): void => {
  ctx.counts[table] = (ctx.counts[table] ?? 0) + n;
};

async function seedLocale(
  prisma: PrismaClient,
  locale: Locale,
  passwordHash: string,
): Promise<Ctx['counts']> {
  const c = CONTENT[locale];
  const built = validateContent(c, locale);
  const builtByKey = Object.fromEntries(built.map((p) => [p.key, p])) as Record<
    string,
    BuiltPage
  >;
  const orgId = orgIdFor(locale);
  const ctx: Ctx = {
    prisma,
    locale,
    c,
    orgId,
    now: Date.now(),
    uid: (p) => userIdFor(locale, p),
    teamId: (t) => `${orgId}-team-${t}`,
    folderIds: {} as Ctx['folderIds'],
    fileIds: {} as Ctx['fileIds'],
    versionIds: {} as Ctx['versionIds'],
    projectIds: {} as Ctx['projectIds'],
    pageIds: {},
    pagePublicIds: {},
    vehicleFileIds: {},
    sourceIds: {},
    counts: {},
  };

  await cleanup(prisma, locale, c);
  await seedPeopleAndOrg(ctx, passwordHash);
  await seedKnowledgeBase(ctx);
  await seedAssistants(ctx);
  await seedBrain(ctx, builtByKey);
  await seedShowcaseThreads(ctx);
  await seedAnalyticsHistory(ctx);
  await seedAdminData(ctx);
  return ctx.counts;
}

// --- People, organization, teams -------------------------------------------

async function seedPeopleAndOrg(ctx: Ctx, passwordHash: string): Promise<void> {
  const { prisma, c, orgId, locale } = ctx;
  const people = Object.keys(PEOPLE) as PersonKey[];

  for (const [i, person] of people.entries()) {
    const id = ctx.uid(person);
    await prisma.user.create({
      data: {
        id,
        email: emailFor(c, person),
        name: c.people[person].name,
        emailVerified: true,
        onboardingComplete: true,
        role: 'user',
        createdAt: ago(ctx, 420 - i * 30),
      },
    });
    // Better Auth 1.7 finds a credential account by providerId, issuer and
    // accountId together, and accountId is the *user id* for a password
    // account — see the e2e seed and tests/architecture/better-auth-account-writes.
    await prisma.account.create({
      data: {
        id: `${id}-credential`,
        userId: id,
        providerId: 'credential',
        accountId: id,
        issuer: 'local:credential',
        password: passwordHash,
      },
    });
  }
  bump(ctx, 'users', people.length);
  bump(ctx, 'accounts', people.length);

  await prisma.organization.create({
    data: {
      id: orgId,
      name: c.orgName,
      slug: `nordwind-logistics-${locale}`,
      vectorStore: 'qdrant',
      hasKnowledge: true,
      createdAt: ago(ctx, 420),
    },
  });
  bump(ctx, 'organizations');

  const featureOverrides: FeatureOverrides = {
    brain: true,
    publicThreadLinks: true,
    inviteMembers: true,
  };
  await prisma.organizationSettings.create({
    data: {
      organizationId: orgId,
      model: ASSISTANTS.hr.model,
      temperature: 0.3,
      featureOverrides,
      allowedModels: [
        'gpt-5.4',
        'gpt-5.4-mini',
        'claude-sonnet-4-6',
        'gemini-2.5-flash',
        'mistral-small-3.2',
      ],
      storageLimitBytes: BigInt(10 * 1024 ** 3),
      projectStorageLimitBytes: BigInt(2 * 1024 ** 3),
      singleFileLimitBytes: BigInt(50 * 1024 ** 2),
      monthlyTokenLimit: BigInt(40_000_000),
      monthlyCostLimitCents: 50_000,
      monthlyMessageLimit: 20_000,
      monthlyApiRequestLimit: 5_000,
      maxMembers: 50,
      multiQueryEnabled: true,
      docSummariesEnabled: true,
    },
  });
  bump(ctx, 'organization_settings');

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { name: 'Enterprise', type: 'INTERNAL' },
  });
  if (!plan) {
    await prisma.subscriptionPlan.create({
      data: {
        name: 'Enterprise',
        type: 'INTERNAL',
        status: 'ACTIVE',
        limits: {},
        priceId: 'internal_enterprise',
      },
    });
  }
  await prisma.subscription.create({
    data: {
      id: `${orgId}-subscription`,
      plan: 'Enterprise',
      referenceId: orgId,
      status: 'active',
      seats: 25,
      periodStart: ago(ctx, 24),
      periodEnd: ago(ctx, -341),
    },
  });
  bump(ctx, 'subscriptions');

  for (const [i, person] of people.entries()) {
    const role = PEOPLE[person].role;
    if (!role) {
      continue;
    }
    await prisma.member.create({
      data: {
        id: `${ctx.uid(person)}-member`,
        organizationId: orgId,
        userId: ctx.uid(person),
        role,
        createdAt: ago(ctx, 415 - i * 30),
      },
    });
    bump(ctx, 'members');
  }

  // "General" is the team `finalizeOnboardingCommand` would create on first
  // sign-in; seeding it keeps the teams page from changing under a screenshot.
  const teams: [string, string][] = [
    [`${orgId}-general`, 'General'],
    ...(Object.keys(c.teams) as TeamKey[]).map((t): [string, string] => [
      ctx.teamId(t),
      c.teams[t],
    ]),
  ];
  const budgets: Record<string, number> = {
    hr: 15_000,
    sales: 25_000,
    support: 20_000,
    compliance: 8_000,
  };
  for (const [id, name] of teams) {
    const key = id.split('-team-')[1];
    await prisma.team.create({
      data: {
        id,
        name,
        organizationId: orgId,
        budgetUsdCents: key ? (budgets[key] ?? 1000) : 1000,
        allowedModels: key === 'sales' ? ['claude-sonnet-4-6', 'gpt-5.4'] : [],
        createdAt: ago(ctx, 400),
      },
    });
  }
  bump(ctx, 'teams', teams.length);
  for (const person of people) {
    if (!PEOPLE[person].role) {
      continue;
    }
    const memberships = [
      `${orgId}-general`,
      ...PEOPLE[person].teams.map((t) => ctx.teamId(t)),
    ];
    for (const teamId of memberships) {
      await prisma.teamMember.create({
        data: {
          id: `${teamId}-${person}`,
          teamId,
          userId: ctx.uid(person),
          createdAt: ago(ctx, 390),
        },
      });
      bump(ctx, 'team_members');
    }
  }
  const counts = await prisma.teamMember.groupBy({
    by: ['teamId'],
    where: { team: { organizationId: orgId } },
    _count: true,
  });
  for (const row of counts) {
    await prisma.team.update({
      where: { id: row.teamId },
      data: { memberCount: row._count },
    });
  }

  // A pending invitation, so the members page shows one.
  await prisma.invitation.create({
    data: {
      id: `${orgId}-invitation-1`,
      organizationId: orgId,
      email: `${locale === 'pl' ? 'ewa.szymanska' : 'emma.scott'}@${EMAIL_DOMAIN}`,
      role: 'member',
      status: 'pending',
      expiresAt: ago(ctx, -5),
      inviterId: ctx.uid('magdalena'),
      teamId: ctx.teamId('hr'),
      createdAt: ago(ctx, 2),
    },
  });
  bump(ctx, 'invitations');
}

// --- Knowledge base ----------------------------------------------------------

async function seedKnowledgeBase(ctx: Ctx): Promise<void> {
  const { prisma, c, orgId, locale } = ctx;

  // Roots first, so a child can carry its parent's id in `path` — the column
  // holds ancestor *ids* (`/<parentId>/`), which the breadcrumbs look up.
  const order = (Object.keys(FOLDERS) as FolderKey[]).sort(
    (a, b) =>
      Number(Boolean(FOLDERS[a].parent)) - Number(Boolean(FOLDERS[b].parent)),
  );
  for (const key of order) {
    const meta = FOLDERS[key];
    const id = stableUuid(`${locale}:folder:${key}`);
    ctx.folderIds[key] = id;
    const parentId = meta.parent ? ctx.folderIds[meta.parent] : null;
    await prisma.documentFolder.create({
      data: {
        id,
        name: c.folders[key],
        organizationId: orgId,
        parentId,
        path: parentId ? `/${parentId}/` : '/',
        ownerId: ctx.uid(meta.owner),
        teamId: meta.team ? ctx.teamId(meta.team) : null,
        isOrgWide: !meta.team,
        piiPolicy: meta.strict ? 'STRICT' : null,
        createdAt: ago(ctx, 400),
      },
    });
    bump(ctx, 'document_folders');
  }

  for (const doc of Object.keys(DOCS) as DocKey[]) {
    const meta = DOCS[doc];
    const text = c.documents[doc];
    const fileId = stableUuid(`${locale}:file:${doc}`);
    const documentId = stableUuid(`${locale}:document:${doc}`);
    ctx.fileIds[doc] = fileId;
    const uploaded = ago(ctx, meta.ageDays, 9, 12);
    const restricted = Boolean(FOLDERS[meta.folder].team);
    const versionCount = text.versions.length;
    const lastVersionAt = versionCount > 1 ? ago(ctx, 24, 14, 5) : uploaded;
    const staged = Boolean(meta.staged);

    await prisma.userFile.create({
      data: {
        id: fileId,
        organizationId: orgId,
        fileName: text.fileName,
        fileSize: meta.size,
        fileType: meta.type,
        createdAt: uploaded,
        updatedAt: lastVersionAt,
        isUploaded: true,
        uploadedAt: uploaded,
        parsingStatus: 'COMPLETED',
        parsingStartedAt: new Date(uploaded.getTime() + 5_000),
        parsingCompletedAt: new Date(uploaded.getTime() + 48_000),
        embeddingStatus: staged ? 'STAGED' : 'COMPLETED',
        embeddingStartedAt: staged
          ? null
          : new Date(uploaded.getTime() + 50_000),
        embeddingCompletedAt: staged
          ? null
          : new Date(uploaded.getTime() + 131_000),
        piiPolicy: FOLDERS[meta.folder].strict ? 'STRICT' : 'TOXIC_ONLY',
        isBinaryFile: meta.type !== 'MARKDOWN' && meta.type !== 'URL',
        fileExtension: MIME[meta.type]!.ext,
        fileMimeType: MIME[meta.type]!.mime,
        folderId: ctx.folderIds[meta.folder],
        ownerId: ctx.uid(meta.owner),
        isOrgWide: !restricted,
        pageCount: meta.pageCount,
        language: locale === 'pl' ? 'pol' : 'eng',
        metadata: staged
          ? { intake: 'brain' }
          : meta.type === 'URL'
            ? { url: text.fileName, title: text.title }
            : undefined,
      },
    });
    await prisma.userDocument.create({
      data: {
        id: documentId,
        organizationId: orgId,
        title: text.title,
        content: text.versions.at(-1)!,
        fileId,
        ownerId: ctx.uid(meta.owner),
        createdAt: uploaded,
        updatedAt: lastVersionAt,
      },
    });
    ctx.versionIds[doc] = [];
    for (const [i, versionText] of text.versions.entries()) {
      const id = stableUuid(`${locale}:version:${doc}:${i + 1}`);
      ctx.versionIds[doc].push(id);
      await prisma.documentVersion.create({
        data: {
          id,
          documentId,
          organizationId: orgId,
          versionNumber: i + 1,
          content: versionText,
          title: text.title,
          changeType: 'UPLOAD',
          authorId: ctx.uid(meta.owner),
          comment: i === 0 ? null : (text.versionComments?.[i - 1] ?? null),
          isActive: i === versionCount - 1,
          createdAt: i === 0 ? uploaded : lastVersionAt,
        },
      });
      bump(ctx, 'document_versions');
    }
    bump(ctx, 'user_files');
    bump(ctx, 'user_documents');
  }

  // The HR folder is also shared, read-only, with the Compliance team — a
  // grant the sharing dialog shows. (Payroll's restriction is its teamId.)
  await prisma.documentPermission.create({
    data: {
      resourceType: 'folder',
      folderId: ctx.folderIds.hr,
      granteeType: 'team',
      granteeId: ctx.teamId('compliance'),
      permission: 'view',
      grantedBy: ctx.uid('magdalena'),
      createdAt: ago(ctx, 60),
    },
  });
  bump(ctx, 'document_permissions');
}

// --- Assistants --------------------------------------------------------------

async function seedAssistants(ctx: Ctx): Promise<void> {
  const { prisma, c, orgId, locale } = ctx;

  // The oldest project is the organization's hidden default ("main") one —
  // `getDefaultProjectIdQuery` — and the grid never shows it.
  const defaultId = stableUuid(`${locale}:project:default`);
  ctx.projectIds.default = defaultId;
  await prisma.project.create({
    data: {
      id: defaultId,
      title: 'Default Assistant',
      organizationId: orgId,
      ownerId: ctx.uid('anna'),
      createdAt: ago(ctx, 420),
    },
  });
  bump(ctx, 'projects');

  const mcpByAssistant: Record<AssistantKey, string[]> = {
    hr: [],
    sales: ['HUBSPOT'],
    support: ['SLACK'],
    compliance: [],
  };
  for (const [i, key] of (
    Object.keys(ASSISTANTS) as AssistantKey[]
  ).entries()) {
    const meta = ASSISTANTS[key];
    const id = stableUuid(`${locale}:project:${key}`);
    ctx.projectIds[key] = id;
    await prisma.project.create({
      data: {
        id,
        title: c.assistants[key].title,
        organizationId: orgId,
        ownerId: ctx.uid(meta.owner),
        isStarred: key === 'hr',
        createdAt: ago(ctx, 200 - i * 20),
        settings: {
          create: {
            instructions: c.assistants[key].instructions,
            enabledMcpProviders: mcpByAssistant[key],
            integrationsPromptedAt: ago(ctx, 199 - i * 20),
          },
        },
      },
    });
    // Visible to its team, and to the CEO and COO, who are not owners — an
    // org admin gets no bypass on the projects list.
    const grants: {
      granteeType: string;
      granteeId: string;
      permission: string;
    }[] = [
      {
        granteeType: 'team',
        granteeId: ctx.teamId(meta.team),
        permission: 'full',
      },
      { granteeType: 'user', granteeId: ctx.uid('anna'), permission: 'full' },
      { granteeType: 'user', granteeId: ctx.uid('tomasz'), permission: 'view' },
    ];
    for (const grant of grants) {
      await prisma.projectPermission.create({
        data: {
          projectId: id,
          ...grant,
          grantedBy: ctx.uid(meta.owner),
          createdAt: ago(ctx, 190 - i * 20),
        },
      });
      bump(ctx, 'project_permissions');
    }
    bump(ctx, 'projects');
    bump(ctx, 'project_settings');

    // An assistant reaches files through per-file copies (`sourceFileId`),
    // the way "import from knowledge base" makes them — there is no folder
    // binding in the schema. Only the assistant's primary folder is copied.
    const primary = meta.folders[0]!;
    const docs = (Object.keys(DOCS) as DocKey[]).filter(
      (d) => DOCS[d].folder === primary && !DOCS[d].staged,
    );
    for (const doc of docs) {
      const source = DOCS[doc];
      const created = ago(ctx, Math.min(source.ageDays, 180 - i * 20) - 1, 11);
      await prisma.userFile.create({
        data: {
          id: stableUuid(`${locale}:copy:${key}:${doc}`),
          organizationId: orgId,
          fileName: c.documents[doc].fileName,
          fileSize: source.size,
          fileType: source.type,
          projectId: id,
          sourceFileId: ctx.fileIds[doc],
          isUploaded: true,
          uploadedAt: created,
          createdAt: created,
          isBinaryFile: source.type !== 'MARKDOWN' && source.type !== 'URL',
          fileExtension: MIME[source.type]!.ext,
          fileMimeType: MIME[source.type]!.mime,
          ownerId: ctx.uid(source.owner),
          isOrgWide: !FOLDERS[source.folder].team,
          parsingStatus: 'COMPLETED',
          embeddingStatus: 'COMPLETED',
          metadata: {},
        },
      });
      bump(ctx, 'user_files (assistant copies)');
    }
  }
}

// --- Brain -------------------------------------------------------------------

async function seedBrain(
  ctx: Ctx,
  built: Record<string, BuiltPage>,
): Promise<void> {
  const { prisma, orgId, c, locale } = ctx;
  const findings = computedFindings(c);
  // The seed promises exactly these; a content edit that changes one should
  // fail here rather than produce a screenshot that no longer shows it.
  const expect = (label: string, actual: unknown, wanted: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      throw new Error(
        `Brain ${label} would be ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`,
      );
    }
  };
  expect('orphans', findings.orphans, ['whistleblowing']);
  expect('owner-left pages', findings.ownerLeft, ['frame-agreement']);
  expect('stale sources', findings.stale, [
    { page: 'remote-work', sourceIndex: 0 },
  ]);

  const keys = Object.keys(PAGES);
  for (const [i, key] of keys.entries()) {
    const meta = PAGES[key]!;
    const page = built[key]!;
    const publicId = stableUuid(`${locale}:page:${key}`);
    const created = ago(ctx, 34 - (i % 12), 8 + (i % 9), (i * 7) % 60);
    const accessibleBy = meta.team
      ? [`team:${ctx.teamId(meta.team)}`]
      : [`org:${orgId}`];
    const curated = meta.status === 'APPROVED' || meta.status === 'STALE';
    const row = await prisma.knowledgePage.create({
      data: {
        publicId,
        organizationId: orgId,
        title: page.title,
        slug: page.slug,
        type: meta.type,
        content: page.content,
        contentHash: page.contentHash,
        status: meta.status,
        ownerId: meta.owner ? ctx.uid(meta.owner) : null,
        accessibleBy,
        validFrom: curated ? ago(ctx, 30) : null,
        verifyEvery: curated && meta.type === 'POLICY' ? 'P6M' : null,
        lastVerifiedAt:
          curated && meta.type === 'POLICY' && meta.owner ? ago(ctx, 12) : null,
        lastVerifiedBy:
          curated && meta.type === 'POLICY' && meta.owner
            ? ctx.uid(meta.owner)
            : null,
        createdAt: created,
      },
      select: { id: true },
    });
    ctx.pageIds[key] = row.id;
    ctx.pagePublicIds[key] = publicId;
    ctx.sourceIds[key] = [];
    for (const source of page.sources) {
      const s = await prisma.knowledgePageSource.create({
        data: {
          organizationId: orgId,
          pageId: row.id,
          fileId: ctx.fileIds[source.doc],
          documentVersionId: ctx.versionIds[source.doc][source.version - 1]!,
          span: source.span,
          quote: source.quote,
          hash: quoteHash(source.quote),
          createdAt: created,
        },
        select: { id: true },
      });
      ctx.sourceIds[key].push(s.id);
      bump(ctx, 'knowledge_page_sources');
    }
    // `updatedAt` is @updatedAt, which Prisma overwrites on every write; the
    // pages list sorts on it, so give it a believable spread directly.
    await prisma.$executeRaw`UPDATE knowledge_pages SET updated_at = ${ago(ctx, i % 11, 9 + (i % 8), (i * 13) % 60)} WHERE id = ${row.id}`;
    bump(ctx, 'knowledge_pages');
  }

  for (const [from, to, kind, origin, confidence] of EDGES) {
    await prisma.knowledgeEdge.create({
      data: {
        organizationId: orgId,
        fromPageId: ctx.pageIds[from]!,
        toPageId: ctx.pageIds[to]!,
        kind:
          locale === 'pl'
            ? (EDGE_KIND_PL[kind] ?? kind)
            : kind.replace(/_/g, ' '),
        origin,
        confidence,
        createdAt: ago(ctx, 30),
      },
    });
    bump(ctx, 'knowledge_edges');
  }

  // Publication, faked without the worker: the vehicle file, `publishedAt`
  // and a PUBLISH decision, exactly as `publishKnowledgePageCommand` writes
  // them, with the file already COMPLETED as `brainPublishPage` would leave
  // it. No vectors are written, so a published page renders everywhere but
  // is not retrievable by a live chat until the worker republishes it.
  const decided = new Set(DECISIONS.map((d) => `${d.page}:${d.action}`));
  const decisions: {
    page: string;
    actor: PersonKey;
    action: string;
    daysAgo: number;
  }[] = [...DECISIONS];
  for (const [i, key] of keys.entries()) {
    const meta = PAGES[key]!;
    if (
      (meta.status === 'APPROVED' || meta.status === 'STALE') &&
      meta.owner &&
      !decided.has(`${key}:APPROVE`)
    ) {
      decisions.push({
        page: key,
        actor: meta.owner,
        action: 'APPROVE',
        daysAgo: 28 - (i % 20),
      });
    }
    if (meta.published && !decided.has(`${key}:PUBLISH`)) {
      decisions.push({
        page: key,
        actor: 'anna',
        action: 'PUBLISH',
        daysAgo: 6 - (i % 5),
      });
    }
  }
  for (const key of keys.filter((k) => PAGES[k]!.published)) {
    const meta = PAGES[key]!;
    const page = built[key]!;
    const fileId = stableUuid(`${locale}:vehicle:${key}`);
    const publishDecision = decisions.find(
      (d) => d.page === key && d.action === 'PUBLISH',
    )!;
    const publishedAt = ago(ctx, publishDecision.daysAgo, 16, 30);
    await prisma.userFile.create({
      data: {
        id: fileId,
        organizationId: orgId,
        fileName: vehicleFileName(page.title),
        fileSize: Buffer.byteLength(page.content, 'utf8'),
        fileType: 'MARKDOWN',
        isBinaryFile: false,
        isUploaded: true,
        uploadedAt: publishedAt,
        createdAt: publishedAt,
        ownerId: ctx.uid(meta.owner!),
        isOrgWide: true,
        parsingStatus: 'COMPLETED',
        embeddingStatus: 'COMPLETED',
        embeddingCompletedAt: new Date(publishedAt.getTime() + 20_000),
        fileExtension: 'md',
        fileMimeType: 'text/markdown',
        language: locale === 'pl' ? 'pol' : 'eng',
        metadata: {
          brain: {
            pageId: ctx.pagePublicIds[key],
            contentHash: page.contentHash,
            publicationGeneration: 1,
          },
        },
      },
    });
    ctx.vehicleFileIds[key] = fileId;
    await prisma.knowledgePage.update({
      where: { id: ctx.pageIds[key]! },
      data: { publishedFileId: fileId, publishedAt, publicationGeneration: 1 },
    });
    bump(ctx, 'user_files (published pages)');
  }
  // The update above bumped updatedAt to now; put it back to the publish date.
  for (const key of keys.filter((k) => PAGES[k]!.published)) {
    const d = decisions.find((x) => x.page === key && x.action === 'PUBLISH')!;
    await prisma.$executeRaw`UPDATE knowledge_pages SET updated_at = ${ago(ctx, d.daysAgo, 16, 31)} WHERE id = ${ctx.pageIds[key]!}`;
  }

  for (const d of decisions.sort((a, b) => b.daysAgo - a.daysAgo)) {
    const pageId = ctx.pageIds[d.page]!;
    const meta = PAGES[d.page]!;
    const shape: Record<
      string,
      { before: object; after: object; generation: number | null }
    > = {
      APPROVE: {
        before: { status: 'CANDIDATE' },
        after: { status: 'APPROVED' },
        generation: null,
      },
      REJECT: {
        before: { status: 'CANDIDATE' },
        after: { status: 'REJECTED' },
        generation: null,
      },
      SET_OWNER: {
        before: { ownerId: null },
        after: { ownerId: meta.owner ? ctx.uid(meta.owner) : null },
        generation: null,
      },
      PUBLISH: {
        before: { publishedAt: null },
        after: {
          contentHash: built[d.page]!.contentHash,
          fileId: ctx.vehicleFileIds[d.page],
        },
        generation: 1,
      },
    };
    const s = shape[d.action]!;
    await prisma.knowledgeDecision.create({
      data: {
        organizationId: orgId,
        pageId,
        actorId: ctx.uid(d.actor),
        action: d.action as 'APPROVE',
        publicationGeneration: s.generation,
        before: s.before,
        after: s.after,
        createdAt: ago(ctx, d.daysAgo, 15, 10),
      },
    });
    bump(ctx, 'knowledge_decisions');
  }

  // Findings, in the shapes and fingerprints the worker writes.
  const runId = stableUuid(`${locale}:brain-run`);
  const contradiction = (a: string, b: string, explanation: string) => {
    const pageIds = [ctx.pageIds[a]!, ctx.pageIds[b]!].sort((x, y) => x - y);
    const [sa, sb] = [ctx.sourceIds[a]![0]!, ctx.sourceIds[b]![0]!];
    const fingerprint = `${Math.min(sa, sb)}:${Math.max(sa, sb)}`;
    return {
      organizationId: orgId,
      type: 'CONTRADICTION' as const,
      severity: (PAGES[a]!.published || PAGES[b]!.published
        ? 'HIGH'
        : 'MEDIUM') as 'HIGH',
      pageIds,
      detail: {
        fingerprint,
        pairs: [{ aSourceId: sa, bSourceId: sb, explanation }],
        truncated: false,
        runId,
      },
      detectedAt: ago(ctx, 3, 3, 12),
    };
  };
  const staleSource = findings.stale[0]!;
  const stalePageSourceId =
    ctx.sourceIds[staleSource.page]![staleSource.sourceIndex]!;
  const staleDoc =
    c.pages[staleSource.page]!.claims[staleSource.sourceIndex]!.source.doc;
  const frameOwner = ctx.uid(PAGES['frame-agreement']!.owner!);
  await prisma.knowledgeFinding.createMany({
    data: [
      contradiction('annual-leave', 'leave-faq', c.findingText.leaveDays),
      contradiction(
        'leave-request',
        'leave-request-faq',
        c.findingText.leaveNotice,
      ),
      {
        organizationId: orgId,
        type: 'STALE',
        severity: 'MEDIUM',
        pageIds: [ctx.pageIds[staleSource.page]!],
        fileId: ctx.fileIds[staleDoc],
        detail: {
          rule: 'stale',
          reasons: [
            {
              kind: 'quote_gone',
              sourceId: stalePageSourceId,
              fileId: ctx.fileIds[staleDoc],
              pinnedVersionId: ctx.versionIds[staleDoc][0],
              activeVersionId: ctx.versionIds[staleDoc].at(-1),
            },
          ],
          fingerprint: `quote_gone:${stalePageSourceId}`,
        },
        detectedAt: ago(ctx, 23, 2, 40),
      },
      {
        organizationId: orgId,
        type: 'UNOWNED',
        severity: 'MEDIUM',
        pageIds: [ctx.pageIds['frame-agreement']!],
        detail: {
          rule: 'owner_left',
          ownerId: frameOwner,
          fingerprint: `owner_left:${frameOwner}`,
        },
        detectedAt: ago(ctx, 9, 2, 40),
      },
      {
        organizationId: orgId,
        type: 'ORPHAN',
        severity: 'LOW',
        pageIds: [ctx.pageIds.whistleblowing!],
        detail: { rule: 'no_links', fingerprint: 'no_links' },
        detectedAt: ago(ctx, 5, 2, 40),
      },
      {
        organizationId: orgId,
        type: 'EXTRACTION_FAILED',
        severity: 'MEDIUM',
        fileId: ctx.fileIds[EXTRACTION_FAILED_DOC],
        pageIds: [],
        detail: {
          reason:
            'the model returned no valid JSON for this window after 3 attempts',
          windowIndex: 0,
          runId,
        },
        detectedAt: ago(ctx, 4, 3, 5),
      },
    ],
  });
  bump(ctx, 'knowledge_findings', 6);
}

const EDGE_KIND_PL: Record<string, string> = {
  part_of: 'jest częścią',
  constrains: 'ogranicza',
  contradicts: 'przeczy',
  owns: 'odpowiada za',
  related_to: 'dotyczy',
  precedes: 'poprzedza',
  implements: 'realizuje',
  performs: 'wykonuje',
};

// --- Threads -----------------------------------------------------------------

/** The file a thread source names: a document, or a published page's vehicle. */
function sourceFileId(ctx: Ctx, ref: DemoThreadSource['ref']): string {
  if (ref.startsWith('page:')) {
    const id = ctx.vehicleFileIds[ref.slice(5)];
    if (!id) {
      throw new Error(`${ref} is not published`);
    }
    return id;
  }
  return ctx.fileIds[ref as DocKey];
}

interface Turn {
  question: string;
  answer: string;
  sources: { fileId: string; snippet: string | null }[];
  /** 1-based indexes of `sources` the answer cites. */
  cited: number[];
  at: Date;
  rate?: number | null;
}

/**
 * One thread, written the way a real turn writes it: the question and the
 * answer as messages, then `document_retrievals` (rank, snippet) and
 * `document_citations` in `recordKnowledgeUsageCommand`'s shape. Plaintext
 * with `encryptedDek` null, which the reader decrypts as a no-op.
 */
async function writeThread(
  ctx: Ctx,
  t: {
    id: string;
    title: string;
    user: PersonKey;
    project: string;
    model: string;
    turns: Turn[];
    teamId?: string | null;
  },
): Promise<void> {
  const { prisma, orgId } = ctx;
  const userId = ctx.uid(t.user);
  await prisma.thread.create({
    data: {
      id: t.id,
      title: t.title,
      organizationId: orgId,
      userId,
      visitorId: userId,
      projectId: t.project,
      preferredModel: t.model,
      teamId: t.teamId ?? null,
      createdAt: t.turns[0]!.at,
    },
  });
  bump(ctx, 'threads');
  for (const [i, turn] of t.turns.entries()) {
    await prisma.message.create({
      data: {
        id: stableUuid(`${t.id}:q:${i}`),
        threadId: t.id,
        role: 'USER',
        content: turn.question,
        visitorId: userId,
        createdAt: turn.at,
      },
    });
    const answerId = stableUuid(`${t.id}:a:${i}`);
    const answeredAt = new Date(
      turn.at.getTime() + 6_000 + (turn.answer.length % 9) * 1_000,
    );
    await prisma.message.create({
      data: {
        id: answerId,
        threadId: t.id,
        role: 'ASSISTANT',
        content: turn.answer,
        runId: '',
        rate: turn.rate ?? null,
        createdAt: answeredAt,
      },
    });
    bump(ctx, 'messages', 2);
    if (turn.sources.length > 0) {
      await prisma.documentRetrieval.createMany({
        data: turn.sources.map((s, rank) => ({
          messageId: answerId,
          fileId: s.fileId,
          orgId,
          rank: rank + 1,
          snippet: s.snippet,
          createdAt: answeredAt,
        })),
      });
      bump(ctx, 'document_retrievals', turn.sources.length);
    }
    if (turn.cited.length > 0) {
      await prisma.documentCitation.createMany({
        data: turn.cited.map((n) => ({
          messageId: answerId,
          fileId: turn.sources[n - 1]!.fileId,
          orgId,
          createdAt: answeredAt,
        })),
      });
      bump(ctx, 'document_citations', turn.cited.length);
    }
    await writeTurnUsage(ctx, {
      threadId: t.id,
      projectId: t.project,
      userId,
      teamId: t.teamId ?? null,
      model: t.model,
      at: answeredAt,
      answerLength: turn.answer.length,
      sourceCount: turn.sources.length,
    });
  }
}

async function writeTurnUsage(
  ctx: Ctx,
  u: {
    threadId: string;
    projectId: string;
    userId: string;
    teamId: string | null;
    model: string;
    at: Date;
    answerLength: number;
    sourceCount: number;
  },
): Promise<void> {
  const r = rng(u.at.getTime() % 2_147_483_647);
  const chatIn = 1800 + u.sourceCount * 650 + Math.floor(r() * 900);
  const chatOut = Math.round(u.answerLength / 3.6) + Math.floor(r() * 60);
  const rephraseIn = 420 + Math.floor(r() * 120);
  const rephraseOut = 60 + Math.floor(r() * 30);
  const embedIn = 40 + Math.floor(r() * 30);
  const base = {
    organizationId: ctx.orgId,
    projectId: u.projectId,
    threadId: u.threadId,
    userId: u.userId,
    teamId: u.teamId,
    provider: 'litellm',
  };
  await ctx.prisma.aiUsage.createMany({
    data: [
      {
        ...base,
        step: 'REPHRASING',
        model: 'gpt-5.4-mini',
        inputTokens: rephraseIn,
        outputTokens: rephraseOut,
        totalTokens: rephraseIn + rephraseOut,
        estimatedCost: cost('gpt-5.4-mini', rephraseIn, rephraseOut),
        durationMs: 380 + Math.floor(r() * 300),
        createdAt: new Date(u.at.getTime() - 4_000),
      },
      {
        ...base,
        step: 'EMBEDDINGS',
        model: 'qwen3-embedding-8b',
        inputTokens: embedIn,
        outputTokens: 0,
        totalTokens: embedIn,
        estimatedCost: cost('qwen3-embedding-8b', embedIn, 0),
        durationMs: 90 + Math.floor(r() * 80),
        createdAt: new Date(u.at.getTime() - 3_500),
      },
      {
        ...base,
        step: 'CHAT_COMPLETION',
        model: u.model,
        inputTokens: chatIn,
        outputTokens: chatOut,
        totalTokens: chatIn + chatOut,
        estimatedCost: cost(u.model, chatIn, chatOut),
        durationMs: 2400 + Math.floor(r() * 4000),
        metadata: { source: 'UI' },
        createdAt: u.at,
      },
    ],
  });
  bump(ctx, 'ai_usage', 3);
}

async function seedShowcaseThreads(ctx: Ctx): Promise<void> {
  const { c, locale } = ctx;
  // The HR questions go to the organization's main (default) assistant, the
  // rest to their department's; all are the CEO's, so her sidebar has them.
  const plan: { assistant: AssistantKey; project: string; model: string }[] = [
    {
      assistant: 'hr',
      project: ctx.projectIds.default,
      model: ASSISTANTS.hr.model,
    },
    {
      assistant: 'sales',
      project: ctx.projectIds.sales,
      model: ASSISTANTS.sales.model,
    },
    {
      assistant: 'support',
      project: ctx.projectIds.support,
      model: ASSISTANTS.support.model,
    },
  ];
  let n = 0;
  for (const { assistant, project, model } of plan) {
    for (const thread of c.threads[assistant] ?? []) {
      const start = ago(ctx, 5 - (n % 5), 9 + n, 14 + n * 3);
      const turns: Turn[] = [toTurn(ctx, thread, start, 1)];
      if (thread.followUp) {
        turns.push(
          toTurn(
            ctx,
            thread.followUp,
            new Date(start.getTime() + 3 * 60_000),
            null,
          ),
        );
      }
      await writeThread(ctx, {
        id: stableUuid(`${locale}:thread:showcase:${n}`),
        title: thread.title,
        user: 'anna',
        project,
        model,
        turns,
      });
      n += 1;
    }
  }
}

function toTurn(
  ctx: Ctx,
  t: Pick<DemoThread, 'question' | 'answer' | 'sources'>,
  at: Date,
  rate: number | null,
): Turn {
  return {
    question: t.question,
    answer: t.answer,
    sources: t.sources.map((s) => ({
      fileId: sourceFileId(ctx, s.ref),
      snippet: s.snippet,
    })),
    cited: citedIndexes(t.answer),
    at,
    rate,
  };
}

/**
 * Thirty days of questions from the rest of the company, for knowledge
 * analytics (question counts, most-cited documents, negative feedback) and
 * for the AI-usage history. Only the counts and citations are read by those
 * screens; the thread titles make the history page read naturally too.
 */
async function seedAnalyticsHistory(ctx: Ctx): Promise<void> {
  const { c, locale } = ctx;
  const random = rng(locale === 'pl' ? 20260924 : 20260925);
  const askers: PersonKey[] = [
    'tomasz',
    'magdalena',
    'piotr',
    'katarzyna',
    'michal',
    'joanna',
    'pawel',
  ];
  const assistantFor = (doc: DocKey | undefined): AssistantKey => {
    const folder = doc ? DOCS[doc].folder : 'hr';
    return folder === 'sales'
      ? 'sales'
      : folder === 'support'
        ? 'support'
        : folder === 'compliance'
          ? 'compliance'
          : 'hr';
  };
  const pool: { question: string; docs: DocKey[] }[] = [];
  for (const q of c.analyticsQuestions) {
    for (let i = 0; i < q.weight * 4; i += 1) {
      pool.push(q);
    }
  }
  const fillers = Object.keys(DOCS).filter(
    (d) => !DOCS[d as DocKey].staged,
  ) as DocKey[];
  for (const [i, q] of pool.entries()) {
    // Busier on weekdays, quieter at weekends, all within the window.
    let day = Math.floor(random() * ANALYTICS_DAYS);
    const weekday = new Date(ctx.now - day * DAY).getDay();
    if ((weekday === 0 || weekday === 6) && random() < 0.7) {
      day = Math.max(1, day - 2);
    }
    const at = ago(
      ctx,
      day,
      8 + Math.floor(random() * 9),
      Math.floor(random() * 60),
    );
    const answered = q.docs.length > 0;
    const primary = q.docs[0];
    const assistant = assistantFor(primary);
    const user = askers[Math.floor(random() * askers.length)]!;
    const retrieved = [...q.docs];
    while (retrieved.length < 3) {
      const extra = fillers[Math.floor(random() * fillers.length)]!;
      if (!retrieved.includes(extra)) {
        retrieved.push(extra);
      }
    }
    const answer = answered ? analyticsAnswer(c, primary!, locale) : c.noAnswer;
    const roll = random();
    const rate = answered
      ? roll < 0.35
        ? 1
        : roll < 0.42
          ? 0
          : null
      : roll < 0.45
        ? 0
        : null;
    await writeThread(ctx, {
      id: stableUuid(`${locale}:thread:analytics:${i}`),
      title: q.question,
      user,
      project:
        assistant === 'hr' && random() < 0.5
          ? ctx.projectIds.default
          : ctx.projectIds[assistant],
      model: ASSISTANTS[assistant].model,
      teamId: PEOPLE[user].teams[0] ? ctx.teamId(PEOPLE[user].teams[0]!) : null,
      turns: [
        {
          question: q.question,
          answer,
          sources: retrieved.map((d) => ({
            fileId: ctx.fileIds[d],
            snippet: firstParagraph(c.documents[d].versions.at(-1)!),
          })),
          cited: answered ? [1] : [],
          at,
          rate,
        },
      ],
    });
  }
}

/** The first prose paragraph under a heading — what a chunk's snippet reads like. */
export function firstParagraph(text: string): string {
  const para = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .find((p) => p.length > 60 && !p.startsWith('#') && !p.startsWith('|'));
  return (para ?? text.slice(0, 240)).slice(0, 400);
}

function analyticsAnswer(c: DemoContent, doc: DocKey, locale: Locale): string {
  const para = firstParagraph(c.documents[doc].versions.at(-1)!);
  const lead =
    locale === 'pl'
      ? `Zgodnie z dokumentem „${c.documents[doc].title}”:`
      : `According to "${c.documents[doc].title}":`;
  return `${lead} ${para} [1]`;
}

// --- Admin panel, settings, connectors ---------------------------------------

async function seedAdminData(ctx: Ctx): Promise<void> {
  const { prisma, orgId, c, locale } = ctx;

  // Ingest-side usage: embedding each document when it was uploaded, for the
  // ones inside the window; plus some API traffic and guardrail judge calls.
  for (const doc of Object.keys(DOCS) as DocKey[]) {
    const meta = DOCS[doc];
    if (meta.ageDays > ANALYTICS_DAYS || meta.staged) {
      continue;
    }
    const tokens =
      Math.round(c.documents[doc].versions.at(-1)!.length / 3.2) * 4;
    await prisma.aiUsage.create({
      data: {
        organizationId: orgId,
        userId: ctx.uid(meta.owner),
        step: 'EMBEDDINGS',
        provider: 'litellm',
        model: 'qwen3-embedding-8b',
        inputTokens: tokens,
        totalTokens: tokens,
        estimatedCost: cost('qwen3-embedding-8b', tokens, 0),
        durationMs: 1400,
        metadata: { source: 'INGEST', fileId: ctx.fileIds[doc] },
        createdAt: ago(ctx, meta.ageDays, 9, 14),
      },
    });
    bump(ctx, 'ai_usage');
  }
  const random = rng(locale === 'pl' ? 777 : 778);
  for (let day = 0; day < ANALYTICS_DAYS; day += 1) {
    // The customer portal's API key: steady traffic on weekdays, a trickle at
    // weekends, on the support assistant.
    const weekday = new Date(ctx.now - day * DAY).getDay();
    const calls =
      (weekday === 0 || weekday === 6 ? 4 : 18) + Math.floor(random() * 14);
    const apiRows = [];
    for (let i = 0; i < calls; i += 1) {
      const model = random() < 0.7 ? 'gpt-5.4' : 'mistral-small-3.2';
      const input = 2200 + Math.floor(random() * 1500);
      const output = 180 + Math.floor(random() * 250);
      apiRows.push({
        organizationId: orgId,
        projectId: ctx.projectIds.support,
        step: 'CHAT_COMPLETION' as const,
        provider: 'litellm',
        model,
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        estimatedCost: cost(model, input, output),
        durationMs: 1800 + Math.floor(random() * 1500),
        metadata: { source: 'API' },
        createdAt: ago(
          ctx,
          day,
          7 + Math.floor(random() * 12),
          Math.floor(random() * 60),
        ),
      });
    }
    await prisma.aiUsage.createMany({ data: apiRows });
    bump(ctx, 'ai_usage', apiRows.length);
    if (day % 3 === 0) {
      await prisma.aiUsage.create({
        data: {
          organizationId: orgId,
          step: 'GUARDRAIL',
          provider: 'litellm',
          model: 'gpt-5.4-mini',
          inputTokens: 610,
          outputTokens: 12,
          totalTokens: 622,
          estimatedCost: cost('gpt-5.4-mini', 610, 12),
          durationMs: 520,
          createdAt: ago(ctx, day, 13, 5),
        },
      });
      bump(ctx, 'ai_usage');
    }
  }

  // One guardrail of the organization's own, and what it caught this week.
  const guardrail = await prisma.guardrail.create({
    data: {
      organizationId: orgId,
      name: c.guardrail.name,
      description: c.guardrail.description,
      kind: 'PATTERN',
      stage: 'INPUT',
      action: 'BLOCK',
      enabled: true,
      severity: 'warn',
      pattern: c.guardrail.pattern,
      patternIsRegex: true,
      createdBy: ctx.uid('michal'),
      createdAt: ago(ctx, 33),
    },
    select: { publicId: true },
  });
  bump(ctx, 'guardrails');
  const events: {
    type: 'GUARDRAIL_BLOCKED' | 'AUTH_LOGIN_FAILED' | 'MCP_OAUTH_FAILED';
    severity: 'warn' | 'info';
    user: PersonKey | null;
    days: number;
    source: string;
    metadata: object;
  }[] = [
    {
      type: 'GUARDRAIL_BLOCKED',
      severity: 'warn',
      user: 'joanna',
      days: 1,
      source: 'chat',
      metadata: { guardrail: guardrail.publicId, stage: 'INPUT' },
    },
    {
      type: 'GUARDRAIL_BLOCKED',
      severity: 'warn',
      user: 'katarzyna',
      days: 3,
      source: 'chat',
      metadata: { guardrail: guardrail.publicId, stage: 'INPUT' },
    },
    {
      type: 'GUARDRAIL_BLOCKED',
      severity: 'warn',
      user: 'piotr',
      days: 6,
      source: 'chat',
      metadata: { guardrail: guardrail.publicId, stage: 'INPUT' },
    },
    {
      type: 'AUTH_LOGIN_FAILED',
      severity: 'info',
      user: null,
      days: 2,
      source: 'auth',
      metadata: { attempts: 3, email: '[REDACTED]' },
    },
    {
      type: 'MCP_OAUTH_FAILED',
      severity: 'warn',
      user: 'katarzyna',
      days: 4,
      source: 'mcp',
      metadata: {
        provider: 'SLACK',
        source: 'runtime_init',
        reason: 'HTTP 401 Unauthorized',
      },
    },
  ];
  for (const e of events) {
    await prisma.securityEvent.create({
      data: {
        organizationId: orgId,
        userId: e.user ? ctx.uid(e.user) : null,
        eventType: e.type,
        severity: e.severity,
        source: e.source,
        metadata: e.metadata,
        createdAt: ago(ctx, e.days, 11, 20),
      },
    });
    bump(ctx, 'security_events');
  }

  const audit: [
    PersonKey,
    string,
    string,
    string | null,
    object | null,
    object | null,
    number,
  ][] = [
    [
      'anna',
      'settings.updated',
      'organization',
      orgId,
      { model: 'gpt-5.4-mini' },
      { model: 'gpt-5.4' },
      29,
    ],
    [
      'magdalena',
      'team.created',
      'team',
      ctx.teamId('hr'),
      null,
      { name: c.teams.hr },
      28,
    ],
    [
      'magdalena',
      'team.member_added',
      'team',
      ctx.teamId('hr'),
      null,
      { userId: ctx.uid('joanna') },
      28,
    ],
    [
      'magdalena',
      'project.created',
      'project',
      ctx.projectIds.hr,
      null,
      { title: c.assistants.hr.title },
      27,
    ],
    [
      'piotr',
      'project.created',
      'project',
      ctx.projectIds.sales,
      null,
      { title: c.assistants.sales.title },
      26,
    ],
    [
      'magdalena',
      'document.uploaded',
      'file',
      ctx.fileIds['remote-work'],
      null,
      { fileName: c.documents['remote-work'].fileName, version: 2 },
      24,
    ],
    [
      'katarzyna',
      'document.uploaded',
      'file',
      ctx.fileIds.returns,
      null,
      { fileName: c.documents.returns.fileName },
      20,
    ],
    [
      'anna',
      'connector.connected',
      'connector',
      'SLACK',
      null,
      { provider: 'SLACK' },
      18,
    ],
    [
      'piotr',
      'connector.connected',
      'connector',
      'HUBSPOT',
      null,
      { provider: 'HUBSPOT' },
      15,
    ],
    [
      'michal',
      'settings.updated',
      'guardrail',
      guardrail.publicId,
      null,
      { name: c.guardrail.name, action: 'BLOCK' },
      12,
    ],
    [
      'tomasz',
      'team.member_added',
      'team',
      ctx.teamId('support'),
      null,
      { userId: ctx.uid('katarzyna') },
      9,
    ],
    [
      'anna',
      'admin.organization.limits_changed',
      'organization',
      orgId,
      { monthlyCostLimitCents: 30000 },
      { monthlyCostLimitCents: 50000 },
      7,
    ],
    [
      'joanna',
      'document.deleted',
      'file',
      stableUuid(`${locale}:deleted-file`),
      {
        fileName:
          locale === 'pl'
            ? 'Lista_plac_2025_robocza.xlsx'
            : 'Payroll_2025_draft.xlsx',
      },
      null,
      5,
    ],
    [
      'pawel',
      'document.uploaded',
      'file',
      ctx.fileIds['adr-draft'],
      null,
      { fileName: c.documents['adr-draft'].fileName, intake: 'brain' },
      2,
    ],
    [
      'magdalena',
      'thread.created',
      'thread',
      stableUuid(`${locale}:thread:showcase:0`),
      null,
      null,
      1,
    ],
  ];
  for (const [
    who,
    action,
    entityType,
    entityId,
    oldData,
    newData,
    days,
  ] of audit) {
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: ctx.uid(who),
        action,
        entityType,
        entityId,
        oldData: oldData ?? Prisma.JsonNull,
        newData: newData ?? Prisma.JsonNull,
        createdAt: ago(ctx, days, 14, 30),
      },
    });
    bump(ctx, 'audit_logs');
  }

  // Connectors are per user and "connected" is the row's status alone; the
  // vault is consulted only when a tool runs, so these show connected and
  // would fail on first use — there are no tokens behind them.
  const google = process.env.MCP_GOOGLE_SERVER_URL || 'http://localhost:8000';
  const connectors: [
    PersonKey,
    string,
    string,
    'CONNECTED' | 'ERROR',
    number,
    string | null,
  ][] = [
    ['anna', 'SLACK', 'https://mcp.slack.com/mcp', 'CONNECTED', 18, null],
    ['anna', 'HUBSPOT', 'https://mcp.hubspot.com', 'CONNECTED', 16, null],
    ['anna', 'GOOGLE_CALENDAR', google, 'CONNECTED', 14, null],
    ['anna', 'GOOGLE_DRIVE', google, 'CONNECTED', 14, null],
    ['piotr', 'HUBSPOT', 'https://mcp.hubspot.com', 'CONNECTED', 15, null],
    [
      'katarzyna',
      'SLACK',
      'https://mcp.slack.com/mcp',
      'ERROR',
      30,
      'HTTP 401 Unauthorized: {"error":"invalid_grant","description":"token has been revoked by the user"}',
    ],
  ];
  for (const [who, slug, url, status, days, lastError] of connectors) {
    await prisma.mcpConnector.create({
      data: {
        organizationId: orgId,
        userId: ctx.uid(who),
        providerSlug: slug,
        mcpServerUrl: url,
        customerId: `${orgId}:${ctx.uid(who)}:${slug.toLowerCase()}`,
        enabled: true,
        status,
        connectedAt: ago(ctx, days),
        lastError,
        lastErrorAt: lastError ? ago(ctx, 4, 11, 20) : null,
        createdAt: ago(ctx, days),
      },
    });
    bump(ctx, 'mcp_connectors');
  }

  // API keys: rows only — the secret lives in the token vault, and the table
  // holds nothing but the mask (ADR-13). Listing works; calling does not.
  await prisma.apiKey.createMany({
    data: [
      {
        name: locale === 'pl' ? 'portal-klienta' : 'customer-portal',
        maskedValue: 'sk-7f3a...c91e',
        organizationId: orgId,
        projectId: ctx.projectIds.support,
        createdBy: ctx.uid('tomasz'),
        lastUsedAt: ago(ctx, 0, 8, 2),
        knowledgeScope: 'ASSISTANT',
        createdAt: ago(ctx, 60),
      },
      {
        name: locale === 'pl' ? 'integracja-crm' : 'crm-integration',
        maskedValue: 'sk-2b90...04d7',
        organizationId: orgId,
        createdBy: ctx.uid('piotr'),
        lastUsedAt: ago(ctx, 3),
        createdAt: ago(ctx, 45),
      },
    ],
  });
  bump(ctx, 'api_keys', 2);

  const notifications: {
    user: PersonKey;
    type: 'DOCUMENT_SHARED' | 'DOCUMENT_EMBEDDED' | 'PROJECT_SHARED';
    title: string;
    days: number;
    read: boolean;
  }[] =
    locale === 'pl'
      ? [
          {
            user: 'anna',
            type: 'DOCUMENT_EMBEDDED',
            title: 'Dokument „Zwroty i reklamacje” jest gotowy do wyszukiwania',
            days: 20,
            read: true,
          },
          {
            user: 'anna',
            type: 'PROJECT_SHARED',
            title:
              'Piotr Zieliński udostępnił Ci asystenta „Asystent Sprzedaży”',
            days: 26,
            read: true,
          },
          {
            user: 'anna',
            type: 'DOCUMENT_SHARED',
            title:
              'Magdalena Wiśniewska udostępniła folder „HR” zespołowi Compliance',
            days: 1,
            read: false,
          },
        ]
      : [
          {
            user: 'anna',
            type: 'DOCUMENT_EMBEDDED',
            title: '"Returns and Claims" is ready to search',
            days: 20,
            read: true,
          },
          {
            user: 'anna',
            type: 'PROJECT_SHARED',
            title: 'Peter Hughes shared the "Sales Assistant" with you',
            days: 26,
            read: true,
          },
          {
            user: 'anna',
            type: 'DOCUMENT_SHARED',
            title:
              'Megan Wilson shared the "HR" folder with the Compliance team',
            days: 1,
            read: false,
          },
        ];
  for (const n of notifications) {
    await prisma.notification.create({
      data: {
        userId: ctx.uid(n.user),
        organizationId: orgId,
        type: n.type,
        title: n.title,
        isRead: n.read,
        createdAt: ago(ctx, n.days, 12),
      },
    });
    bump(ctx, 'notifications');
  }
}

/** Platform-wide rows, shared by both locales: the apps/admin login and defaults. */
async function seedPlatform(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<void> {
  await prisma.user.upsert({
    where: { id: PLATFORM_ADMIN_ID },
    update: {
      email: PLATFORM_ADMIN_EMAIL,
      role: 'admin',
      banned: false,
      emailVerified: true,
    },
    create: {
      id: PLATFORM_ADMIN_ID,
      email: PLATFORM_ADMIN_EMAIL,
      name: 'Ragen Platform Admin',
      emailVerified: true,
      onboardingComplete: true,
      role: 'admin',
    },
  });
  await prisma.account.upsert({
    where: {
      providerId_accountId: {
        providerId: 'credential',
        accountId: PLATFORM_ADMIN_ID,
      },
    },
    update: { password: passwordHash, issuer: 'local:credential' },
    create: {
      id: `${PLATFORM_ADMIN_ID}-credential`,
      userId: PLATFORM_ADMIN_ID,
      providerId: 'credential',
      accountId: PLATFORM_ADMIN_ID,
      issuer: 'local:credential',
      password: passwordHash,
    },
  });
  // The platform defaults the Limits page edits and "Apply defaults" copies.
  await prisma.settings.upsert({
    where: { key: 'default_organization_limits' },
    update: {},
    create: {
      key: 'default_organization_limits',
      value: JSON.stringify({
        storageLimitBytes: 10 * 1024 ** 3,
        projectStorageLimitBytes: 2 * 1024 ** 3,
        singleFileLimitBytes: 50 * 1024 ** 2,
        monthlyTokenLimit: 40_000_000,
        monthlyCostLimitCents: 50_000,
        monthlyMessageLimit: 20_000,
        monthlyApiRequestLimit: 5_000,
        maxMembers: 50,
      }),
    },
  });
}

async function main(): Promise<void> {
  const locales = parseLocales(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  assertDemoDatabase(url);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await seedPlatform(prisma, passwordHash);
    for (const locale of locales) {
      const started = Date.now();
      const counts = await seedLocale(prisma, locale, passwordHash);
      console.log(
        `\nNordwind Logistics (${locale}) seeded in ${((Date.now() - started) / 1000).toFixed(1)}s:`,
      );
      for (const [table, n] of Object.entries(counts).sort()) {
        console.log(`  ${table.padEnd(32)} ${n}`);
      }
      console.log(
        `  sign in as ${emailFor(CONTENT[locale], 'anna')} / ${DEMO_PASSWORD}`,
      );
    }
    console.log(`\napps/admin: ${PLATFORM_ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error('Nordwind demo seed failed:', error);
    process.exit(1);
  });
}
