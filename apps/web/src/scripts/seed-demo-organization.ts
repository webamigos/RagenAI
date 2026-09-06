/* eslint-disable no-console */
/**
 * Turn an ordinary organization into the demo showcase tenant.
 *
 * Run with:
 *   DEMO_ORGANIZATION_SLUG=<slug> npx tsx src/scripts/seed-demo-organization.ts
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
 * Idempotent: an already-seeded document is skipped by title, and the settings
 * write is an upsert.
 */

import db from '@ragenai/prisma-client';

import { uploadFileCommand } from '@/features/documents/services/commands/upload-file-command';
import {
  DEMO_FEATURE_OVERRIDES,
  DEMO_MONTHLY_COST_LIMIT_CENTS,
} from '@/features/subscriptions/constants/demo-organization';

/**
 * Placeholder corpus.
 *
 * Deliberately generic: with one shared account, prospect B reads prospect A's
 * conversation until the nightly cleanup runs (spec, "Consequences we are
 * accepting"), so nothing here may be anything we would mind a stranger
 * quoting. Replace with real material before the demo is handed out — the
 * shape, not the prose, is what this script fixes.
 */
const PLACEHOLDER_CORPUS = [
  {
    title: 'Ragen — product overview',
    body: `# Ragen — product overview

Ragen answers questions about your own documents. It retrieves the passages
that bear on a question and cites them, so an answer can be checked rather
than trusted.

## What it is for

Teams keep knowledge in documents nobody rereads: contracts, handbooks,
specifications, meeting notes. Ragen makes that material answerable in
conversation, with citations back to the source.

## How retrieval works

Every document is split into passages and indexed twice — once by meaning and
once by wording. A question searches both, and the results are merged. Asking
about a term that appears verbatim and asking about an idea phrased
differently therefore both work.

## What it does not do

It does not invent an answer when the documents do not contain one. If nothing
relevant is retrieved, it says so.`,
  },
  {
    title: 'Sample handbook — expenses and travel',
    body: `# Expenses and travel

A placeholder policy document, written so that questions about it have
checkable answers.

## Approval

Expenses under 500 PLN need no prior approval. Anything above requires written
approval from a team lead before the spend, not after.

## Travel

Book trains in second class and flights in economy. A different class needs
the same written approval as an expense above 500 PLN.

Accommodation is reimbursed up to 600 PLN per night in Warsaw, Krakow and
Wroclaw, and up to 450 PLN elsewhere in Poland.

## Deadlines

Submit receipts within 30 days of the expense. Submissions after 60 days are
not reimbursed without a written exception.

## Not covered

Fines, personal entertainment and alcohol are never reimbursed.`,
  },
  {
    title: 'Sample FAQ — support and availability',
    body: `# Support and availability

A placeholder FAQ, written to be answerable without ambiguity.

## When is support available?

Weekdays between 9:00 and 17:00 Central European Time, excluding Polish public
holidays.

## How quickly is a ticket answered?

A first response arrives within one business day. A ticket marked as blocking
production is answered within four business hours.

## Where is data stored?

In the European Union. Documents and conversations do not leave the region.

## Can a conversation be deleted?

Yes. Deleting a conversation removes its messages and its citations. Deleting a
document removes it from the index, so later answers no longer draw on it.`,
  },
] as const;

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
 * through the real command means the Temporal ingest runs and the passages
 * reach Qdrant.
 */
async function seedCorpus(organizationId: string, projectId: string) {
  let created = 0;
  let skipped = 0;

  for (const document of PLACEHOLDER_CORPUS) {
    const fileName = `${document.title}.md`;

    const existing = await db.userFile.findFirst({
      where: { organizationId, fileName },
      select: { id: true },
    });

    if (existing) {
      console.log(`  skipped (already present): ${fileName}`);
      skipped += 1;
      continue;
    }

    const file = new File([document.body], fileName, {
      type: 'text/markdown',
    });

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

  return { created, skipped };
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
  const args = parseArgs();
  const { organization, project } = await resolveOrganization(args.slug);

  console.log(
    `Demo organization: ${organization.name} (${organization.slug})\nProject: ${project.name}\n`,
  );

  if (!args.restrictOnly) {
    console.log('Corpus:');
    const { created, skipped } = await seedCorpus(organization.id, project.id);
    console.log(`  ${created} ingested, ${skipped} already present\n`);
  }

  if (!args.corpusOnly) {
    console.log('Restrictions:');
    await applyRestrictions(organization.id);
    for (const [key, value] of Object.entries(DEMO_FEATURE_OVERRIDES)) {
      console.log(`  ${key} = ${value}`);
    }
    console.log(
      `  monthlyCostLimitCents = ${DEMO_MONTHLY_COST_LIMIT_CENTS}\n`,
    );
  }

  console.log(
    'Done. Two things this script deliberately does not do:\n' +
      '  - allowedModels: set it in the admin panel, so the choice is visible where it is managed.\n' +
      '  - wait for embeddings: ingest is asynchronous. Check the documents page before demoing.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
