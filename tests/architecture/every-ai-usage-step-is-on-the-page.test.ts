import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every `AiUsageStep` the schema has is renderable on the AI-usage page.
 *
 * The page enumerates the steps five times — a label and a badge colour in the
 * table, a colour and a label in the charts, and an option in the filter bar —
 * and each list is maintained by hand. A step missing from them does not
 * error: the row is written, the cost is counted in the totals, and the step
 * renders with no label, no colour, and no way to filter for it. The number is
 * right and the question is unanswerable.
 *
 * It has happened twice, which is why this is a test and not a note.
 * `RERANKING` has been written by both rerankers since reranking shipped and
 * was in none of the five lists — and reranking is opt-in, so the operator
 * looking for it is by definition someone who turned it on to find out what it
 * costs. `GUARDRAIL` was added to all five by hand in the change that started
 * writing it, which worked, and worked for exactly the same reason nothing
 * would have caught it if it had not.
 *
 * Read as text rather than imported, in the shape
 * `guardrail-vocabularies-agree` uses: these are `'use client'` components
 * whose module graph pulls in React and the generated Prisma browser client,
 * and the question here is about a source file's contents, not its exports.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const schema = readFileSync(join(REPO_ROOT, 'prisma', 'schema.prisma'), 'utf8');

/** The members of one Prisma `enum`, in declaration order. */
function prismaEnum(name: string): string[] {
  const match = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(schema);
  if (!match) {
    throw new Error(`enum ${name} is not in prisma/schema.prisma`);
  }
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('///'));
}

const AI_USAGE_PAGE = join(
  REPO_ROOT,
  'apps/web/src/app/[locale]/(panel)/organization/ai-usage/components',
);

/**
 * The five lists, each named by the file it lives in and the constant it is.
 *
 * Named individually rather than grepped for, because "does this file mention
 * `RERANKING` anywhere" is a weaker question than the one that matters: a
 * step can be in the labels and missing from the colours, and the badge then
 * renders unstyled while every text assertion passes.
 */
const LISTS: { file: string; constant: string }[] = [
  { file: 'AiUsageTable.tsx', constant: 'STEP_LABELS' },
  { file: 'AiUsageTable.tsx', constant: 'STEP_BADGE_COLORS' },
  { file: 'AiUsageCharts.tsx', constant: 'STEP_COLORS' },
  { file: 'AiUsageCharts.tsx', constant: 'STEP_LABELS' },
  { file: 'AiUsageFiltersBar.tsx', constant: 'STEPS' },
];

/**
 * The keys of one `const X: Record<...> = { ... }` or the members named in one
 * `const X = [ ... ]`.
 *
 * Both shapes, because the filter bar's list is an array of
 * `{ value: AiUsageStep.X, label }` objects while the other four are keyed
 * records. Returning the step names from either means the assertion below is
 * the same sentence for all five.
 */
function stepsNamedIn(file: string, constant: string): string[] {
  const source = readFileSync(join(AI_USAGE_PAGE, file), 'utf8');
  const declaration = new RegExp(
    `const ${constant}(?::[^=]*)? = ([\\[{])([\\s\\S]*?)\\n(?:\\]|\\})`,
  ).exec(source);

  if (!declaration) {
    // A renamed or deleted constant must fail loudly. Returning `[]` here
    // would make every assertion below pass over an empty list, which is the
    // failure mode this whole directory keeps re-learning.
    throw new Error(
      `${constant} is not declared in ${file} in a shape this test can read. ` +
        'If it moved, move this entry with it — a guard that cannot find its ' +
        'input reports nothing rather than reporting a problem.',
    );
  }

  const body = declaration[2];
  return [
    // `STEP_LABELS = { CHAT_COMPLETION: '…' }` — a bare key.
    ...[...body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((m) => m[1]),
    // `STEPS = [{ value: AiUsageStep.CHAT_COMPLETION }]` — an enum reference.
    ...[...body.matchAll(/AiUsageStep\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]),
  ];
}

describe('every AiUsageStep is on the AI-usage page', () => {
  const steps = prismaEnum('AiUsageStep');

  it('reads the enum it claims to check', () => {
    // The guard on the guard. `prismaEnum` throws on a missing enum, but a
    // renamed one that happened to match an empty body would leave every
    // assertion below iterating over nothing.
    expect(steps.length).toBeGreaterThan(3);
    expect(steps).toContain('CHAT_COMPLETION');
  });

  it.each(LISTS)(
    '$constant in $file names every step',
    ({ file, constant }) => {
      const named = stepsNamedIn(file, constant);

      expect(
        steps.filter((step) => !named.includes(step)),
        `${constant} in ${file} is missing a step the schema has. The row is ` +
          'still written and still counted — it renders with no label, no ' +
          'colour, or no way to filter for it, which is a right number beside ' +
          'an unanswerable question.',
      ).toEqual([]);
    },
  );

  it.each(LISTS)(
    '$constant in $file names nothing the schema does not have',
    ({ file, constant }) => {
      // The other direction, and not symmetric with it. A step removed from
      // the enum leaves a dead entry that renders for no row and cannot be
      // noticed, and the filter bar's is worse than dead: it is an option a
      // person can select that returns nothing, for ever.
      const named = stepsNamedIn(file, constant);

      expect(
        named.filter((step) => !steps.includes(step)),
        `${constant} in ${file} names a step that is not in the schema.`,
      ).toEqual([]);
    },
  );
});

/**
 * The same question, asked of the two apps that copy the enum by hand.
 *
 * `apps/api` and `apps/worker` each declare `AiUsageStep` as a string-literal
 * union so they need no generated client at that boundary, and each says
 * "keep in sync with the schema by hand" — which is a sentence, not a
 * mechanism. The cost of drift is specific and quiet: a step the union omits
 * cannot be passed by any caller in that app, so the row is never written and
 * the cost never appears anywhere.
 *
 * `apps/api`'s half already has a home in `guardrail-vocabularies-agree`,
 * where `GUARDRAIL` was added to it. The worker's is here because this file is
 * where the general rule now lives, and the worker's union is currently short
 * of two members.
 */
describe('the hand-copied AiUsageStep unions agree with the schema', () => {
  const steps = prismaEnum('AiUsageStep');

  const UNIONS = [
    { app: 'apps/api', path: 'apps/api/src/ai-usage/types.ts' },
    { app: 'apps/worker', path: 'apps/worker/src/services/db/db.ts' },
  ];

  it.each(UNIONS)('$app names every step', ({ path }) => {
    const source = readFileSync(join(REPO_ROOT, path), 'utf8');
    const union = /(?:export )?type AiUsageStep =([\s\S]*?);/.exec(source)?.[1];

    expect(
      union,
      `AiUsageStep is not a string-literal union in ${path}`,
    ).toBeDefined();

    const named = [...(union ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

    expect(
      steps.filter((step) => !named.includes(step)),
      `${path} is missing a step. Nothing in that app can write it, so its ` +
        'cost is absent rather than wrong — which is the harder one to spot.',
    ).toEqual([]);
  });
});
