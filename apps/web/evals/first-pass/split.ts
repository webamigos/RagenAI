/**
 * Split the labelled first-pass set once, into tuning and holdout halves.
 *
 *   npm run eval:first-pass:split -- --in <labelled.jsonl> --seed <number>
 *
 * Writes `tuning.jsonl` and `holdout.jsonl` beside the input and refuses to
 * overwrite either: the spec's rule is one split, made before any model sees
 * a row. Every row must carry a person's label, and no two rows may share a
 * text — a duplicate could land in both halves and leak the holdout into
 * tuning. Both are checked by the same loader the harness reads with.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { parseLabelledSet } from './lib/dataset';
import { splitStratified } from './lib/split';

const { values: args } = parseArgs({
  options: { in: { type: 'string' }, seed: { type: 'string' } },
});

function fail(message: string): never {
  console.error(`first-pass split: ${message}`);
  process.exit(1);
}

const input = args.in ?? fail('--in <labelled.jsonl> is required');
const seed = Number(
  args.seed ??
    fail('--seed <number> is required, and goes in the commit message'),
);
if (!Number.isInteger(seed)) {
  fail('--seed is an integer');
}

const out = {
  tuning: join(dirname(input), 'tuning.jsonl'),
  holdout: join(dirname(input), 'holdout.jsonl'),
};
for (const path of Object.values(out)) {
  if (existsSync(path)) {
    fail(
      `${path} exists. The set is split once; delete it only if no model has seen either half.`,
    );
  }
}

const lines = readFileSync(input, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '');
// Validates every row (labelled, known set and language, no duplicate text)
// and throws on the first that is not.
const rows = parseLabelledSet(lines.join('\n'));
const withLines = rows.map((row, i) => ({
  set: row.set,
  lang: row.lang,
  line: lines[i],
}));

const { tuning, holdout } = splitStratified(withLines, seed);
writeFileSync(out.tuning, `${tuning.map((r) => r.line).join('\n')}\n`);
writeFileSync(out.holdout, `${holdout.map((r) => r.line).join('\n')}\n`);
console.log(`tuning ${tuning.length} rows → ${out.tuning}`);
console.log(`holdout ${holdout.length} rows → ${out.holdout}`);
