import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `packages/jobs` declares four schema enums as unions instead of importing
 * them.
 *
 * It has no choice: each app generates its own Prisma client, so a package
 * shared by all of them cannot import one. The worker's payload type made the
 * same trade for the Temporal sandbox and paid for it — two hand-written
 * copies of values the schema already defined, which is what its own comment
 * says was fixed by importing the generated enums instead.
 *
 * This is that fix in the only form available here: the declaration stays, and
 * a schema change that leaves it behind fails a test rather than surfacing as
 * a payload field that no longer accepts a value the database produces.
 */
const ROOT = join(import.meta.dirname, '..', '..');

const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const contract = readFileSync(
  join(ROOT, 'packages', 'jobs', 'src', 'contract.ts'),
  'utf8',
);

const schemaEnum = (name: string): string[] => {
  const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  expect(
    block,
    `enum ${name} is gone from prisma/schema.prisma`,
  ).not.toBeNull();

  return block![1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0);
};

const declaredUnion = (name: string): string[] => {
  const block = new RegExp(`export type ${name} =([^;]*);`).exec(contract);
  expect(block, `type ${name} is gone from packages/jobs`).not.toBeNull();

  return [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe('the job payload enums match the schema', () => {
  it.each(['FileType', 'ParsingStatus', 'EmbeddingStatus', 'PiiPolicy'])(
    '%s has the same members in both places',
    (name) => {
      expect(
        declaredUnion(name).sort(),
        `packages/jobs' ${name} disagrees with prisma/schema.prisma — a payload cannot carry a value the database can produce`,
      ).toEqual(schemaEnum(name).sort());
    },
  );
});
