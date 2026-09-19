/* eslint-disable no-console */
/**
 * Turn an ordinary organization into the demo showcase tenant.
 *
 * Run with:
 *   TARGET_ENV=demo DEMO_ORGANIZATION_SLUG=<slug> npm run web:seed:demo
 *
 * Through the npm script rather than `npx tsx`, because this script's import
 * chain reaches `feature-guards.ts` and its `import 'server-only'` — a package
 * whose default entry point throws by design, and which only a bundler
 * resolves to the empty module. The script passes `--conditions=react-server`,
 * which makes plain Node pick the same entry. Without it the run dies before
 * `main()`.
 *
 * Add `-- --corpus-only` to re-ingest the corpus into a tenant that is already
 * restricted — which needs `manageDocuments` lifted for the length of the run,
 * for the reason under "Order matters" below.
 *
 * `TARGET_ENV=demo` is required, and the requirement is the point — see
 * `features/subscriptions/services/assert-demo-seed-target`. This script finds
 * its target by slug in whatever database `DATABASE_URL` names, so a stale
 * value in the shell plus a matching slug is all it takes to freeze a real
 * organization.
 *
 * Phase D of docs/specs/2026-09-06-demo-environment.md.
 *
 * ## It does not create the account, on purpose
 *
 * The spec's D1 says "the org, its shared account, the flag overrides…". The
 * account is deliberately left out: a fresh deployment already serves
 * `/initial-account`, and completing that form creates the user through Better
 * Auth, which in turn creates the Better Auth organization, the
 * `InternalOrganization` and a default project (see AGENTS.md, "Auth").
 *
 * Writing those rows here instead would mean writing Better-Auth-owned tables
 * from outside the library, and this repository has already paid for that
 * once: the e2e seed satisfied the Prisma schema but not Better Auth's own
 * lookup, and an upgrade that widened the lookup turned `main` red — see
 * docs/lessons/seeded-rows-must-satisfy-the-librarys-lookup.md. Creating the
 * account through the app's own flow cannot drift from the library's
 * expectations, because it *is* the library.
 *
 * So: create the admin account in the browser first, then point this at it.
 *
 * ## Order matters, and it is not arbitrary
 *
 * The corpus is ingested **before** the restrictions are applied. Phase B
 * gates document writes on `manageDocuments`, and those gates do not exempt a
 * seed — `assertCanManageDocuments` would refuse this script's own uploads the
 * moment the flag went false. Restricting last is the only order that works,
 * and re-running the script after a manual restriction requires lifting the
 * flag again first. `--corpus-only` exists for exactly that case.
 *
 * Idempotent: an already-seeded document is skipped by file name, and the
 * settings write is an upsert. Adding a file to the corpus and re-running
 * therefore uploads that one file.
 */

import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import db from '@ragenai/prisma-client';

import { uploadFileCommand } from '@/features/documents/services/commands/upload-file-command';
import {
  DEMO_FEATURE_OVERRIDES,
  DEMO_MONTHLY_COST_LIMIT_CENTS,
} from '@/features/subscriptions/constants/demo-organization';
import {
  DEMO_SEED_OVERRIDE_FLAG,
  assertDemoSeedTarget,
} from '@/features/subscriptions/services/assert-demo-seed-target';
import {
  DEMO_CORPUS_DIRECTORY,
  DEMO_CORPUS_DIRECTORY_ENV,
  selectDemoCorpusFiles,
} from '@/features/subscriptions/services/demo-corpus';

/**
 * Where the corpus comes from.
 *
 * `scripts/demo-corpus/` in this repository by default — twelve PDF, XLSX and
 * DOCX documents about one fictional company, generated so their facts agree
 * with each other, with the demo questions they answer in its README.
 *
 * It used to be three markdown strings inlined here. They proved the seed ran
 * and were never meant to be shown to anybody — their own comment said to
 * replace them before the demo was handed out. Markdown also exercises none of
 * the ingest paths a prospect's own documents take: PDF through the model,
 * XLSX through SheetJS, DOCX through mammoth. A demo that works over three
 * markdown files has not shown that.
 *
 * `DEMO_CORPUS_DIR` points somewhere else — an absolute path, or one relative
 * to the repository root — for a corpus that should not be committed.
 */
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function corpusDirectory(): string {
  const configured = process.env[DEMO_CORPUS_DIRECTORY_ENV]?.trim();

  if (!configured) {
    return join(REPO_ROOT, DEMO_CORPUS_DIRECTORY);
  }

  return isAbsolute(configured) ? configured : join(REPO_ROOT, configured);
}

/**
 * `DEMO_FEATURE_OVERRIDES` and `DEMO_MONTHLY_COST_LIMIT_CENTS` are imported
 * rather than declared here: this directory is excluded from
 * `apps/web/tsconfig.json`, so a typo in a feature key would not be caught by
 * typecheck and `sanitizeFeatureOverrides` would drop it silently. They live —
 * typed and tested — in `features/subscriptions/constants/demo-organization`.
 */

type Args = { slug: string; corpusOnly: boolean; restrictOnly: boolean };

function parseArgs(): Args {
  const slug = process.env.DEMO_ORGANIZATION_SLUG?.trim();
  if (!slug) {
    throw new Error(
      'DEMO_ORGANIZATION_SLUG is required — the slug of the organization to convert. Create the admin account at /initial-account first.',
    );
  }

  return {
    slug,
    corpusOnly: process.argv.includes('--corpus-only'),
    restrictOnly: process.argv.includes('--restrict-only'),
  };
}

async function resolveOrganization(slug: string) {
  const organization = await db.organization.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!organization) {
    throw new Error(
      `No organization with slug "${slug}". Create the admin account at /initial-account first, then pass the slug it was given.`,
    );
  }

  const project = await db.project.findFirst({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  if (!project) {
    throw new Error(
      `Organization "${slug}" has no project. Account creation normally makes a default one, so this organization was probably not created through /initial-account.`,
    );
  }

  return { organization, project };
}

/**
 * Ingested through `uploadFileCommand`, not written as rows.
 *
 * `apps/web/perf/seed-load.ts` fabricates documents with
 * `embeddingStatus: 'COMPLETED'` and no vectors, which is right for a load
 * test of permission queries and useless here: a demo whose corpus is not
 * really indexed answers every question with "I could not find that". Going
 * through the real command means the ingest job runs and the passages reach
 * Qdrant.
 *
 * It also means this is gated like any other upload: `uploadFileCommand` calls
 * `assertCanManageDocuments`, which the demo tenant's own overrides turn off.
 * That is why the restrictions are applied last, and why re-running this after
 * they are in place needs the flag lifted first — see `main()`.
 */
async function seedCorpus(organizationId: string, projectId: string) {
  const directory = corpusDirectory();

  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    throw new Error(
      `No corpus directory at ${directory}. It ships with the repository as ` +
        `${DEMO_CORPUS_DIRECTORY}; set ${DEMO_CORPUS_DIRECTORY_ENV} to seed from somewhere else.`,
    );
  }

  const { files, skipped } = selectDemoCorpusFiles(entries);

  if (files.length === 0) {
    throw new Error(
      `No uploadable documents in ${directory}. Seeding nothing would leave the demo answering every question with "I could not find that".`,
    );
  }

  for (const name of skipped) {
    console.log(`  ignored (unsupported type): ${name}`);
  }

  let created = 0;
  let skippedCount = 0;

  for (const { fileName, mimeType } of files) {
    const existing = await db.userFile.findFirst({
      where: { organizationId, fileName },
      select: { id: true },
    });

    if (existing) {
      console.log(`  skipped (already present): ${fileName}`);
      skippedCount += 1;
      continue;
    }

    const bytes = await readFile(join(directory, fileName));
    const file = new File([bytes], fileName, { type: mimeType });

    const result = await uploadFileCommand({
      file,
      organizationId,
      organizationSlug: null,
      projectId,
    });

    console.log(
      `  ingesting: ${fileName} (workflow ${result.workflowId}) — embeddings finish asynchronously`,
    );
    created += 1;
  }

  return { created, skipped: skippedCount, directory };
}

async function applyRestrictions(organizationId: string) {
  await db.organizationSettings.upsert({
    where: { organizationId },
    update: {
      featureOverrides: DEMO_FEATURE_OVERRIDES,
      monthlyCostLimitCents: DEMO_MONTHLY_COST_LIMIT_CENTS,
    },
    create: {
      organizationId,
      featureOverrides: DEMO_FEATURE_OVERRIDES,
      monthlyCostLimitCents: DEMO_MONTHLY_COST_LIMIT_CENTS,
    },
  });
}

async function main() {
  // First, before anything reads or writes. `parseArgs` throws on a missing
  // slug, which is a friendlier error but the wrong order: the question
  // "which database is this" has to be answered before the one about which
  // organization.
  const target = assertDemoSeedTarget({
    targetEnv: process.env.TARGET_ENV,
    argv: process.argv,
  });

  if (target.overridden) {
    console.warn(
      `WARNING: seeding with TARGET_ENV=${target.targetEnv} because ` +
        `${DEMO_SEED_OVERRIDE_FLAG} was passed. The demo restrictions are ` +
        `about to be applied to an organization in that environment.\n`,
    );
  }

  const args = parseArgs();
  const { organization, project } = await resolveOrganization(args.slug);

  console.log(
    `Demo organization: ${organization.name} (${organization.slug})\nProject: ${project.name}\n`,
  );

  if (!args.restrictOnly) {
    console.log(`Corpus (${corpusDirectory()}):`);
    const { created, skipped } = await seedCorpus(organization.id, project.id);
    console.log(`  ${created} ingested, ${skipped} already present\n`);
  }

  if (!args.corpusOnly) {
    console.log('Restrictions:');
    await applyRestrictions(organization.id);
    for (const [key, value] of Object.entries(DEMO_FEATURE_OVERRIDES)) {
      console.log(`  ${key} = ${value}`);
    }
    console.log(`  monthlyCostLimitCents = ${DEMO_MONTHLY_COST_LIMIT_CENTS}\n`);
  }

  console.log(
    'Done. Two things this script deliberately does not do:\n' +
      '  - allowedModels: set it in the admin panel, so the choice is visible where it is managed.\n' +
      '  - wait for embeddings: ingest is asynchronous. Check the documents page before demoing.\n' +
      '    A PDF still parsing answers nothing, which is a poor first impression to make.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
