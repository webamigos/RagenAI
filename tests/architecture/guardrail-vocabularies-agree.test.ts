import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `packages/guardrails` and `prisma/schema.prisma` name the same things.
 *
 * The package deliberately does not import a generated Prisma client: it is
 * read by `apps/api`, which compiles to CommonJS and runs the output on plain
 * node, so a dependency on a generated client would put it out of reach. The
 * cost of that choice is a pair of vocabularies that typecheck perfectly
 * against themselves and can still disagree with each other — a rule written
 * as `LLM_POLICY` and read as `LLMPolicy` is a rule that silently never
 * resolves, and nothing in either workspace would say so.
 *
 * This is the tripwire for that, in the shape ADR-33's own test uses: read
 * both as text, and compare. It cannot be satisfied by a comment.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const schema = readFileSync(join(REPO_ROOT, 'prisma', 'schema.prisma'), 'utf8');
const contracts = readFileSync(
  join(REPO_ROOT, 'packages', 'guardrails', 'src', 'contracts', 'guardrail.ts'),
  'utf8',
);

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

/** The entries of one `as const` array in the contracts file. */
function contractArray(name: string): string[] {
  const match = new RegExp(
    `export const ${name} = \\[([^\\]]*)\\] as const`,
  ).exec(contracts);
  if (!match) {
    throw new Error(`${name} is not exported from the guardrails contracts`);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('the guardrail vocabularies agree with the schema', () => {
  it.each([
    ['GuardrailKind', 'GUARDRAIL_KINDS'],
    ['GuardrailStage', 'GUARDRAIL_STAGES'],
    ['GuardrailAction', 'GUARDRAIL_ACTIONS'],
  ])('%s matches %s', (enumName, constantName) => {
    expect(contractArray(constantName)).toEqual(prismaEnum(enumName));
  });

  it('agrees on the override origin, which is what gates the seeded rows', () => {
    // Spelled identically on both sides, against this package's kebab-case
    // habit, because this union is a stored column rather than an in-process
    // one. A spelling that needed translating on the way in is a translation
    // somebody forgets, and an unrecognised origin is read as an ordinary
    // administrator override — which applies everywhere, which turns
    // moderation off for exactly the SaaS tenants the marking protects.
    expect(contractArray('GUARDRAIL_OVERRIDE_ORIGINS')).toEqual(
      prismaEnum('GuardrailOverrideOrigin'),
    );
  });

  it('declares the severities the schema has', () => {
    expect(contractArray('GUARDRAIL_SEVERITIES')).toEqual(
      prismaEnum('SecurityEventSeverity'),
    );
  });
});

describe('the enum members Phase A adds and nothing writes', () => {
  // The ordering constraint the phase split exists for: three separately
  // generated Prisma clients read these columns and the services deploy
  // independently, so every reader has to know a member before any writer
  // produces one. See docs/lessons/adding-an-enum-value-breaks-older-readers.md.
  it.each(['GUARDRAIL_BLOCKED', 'GUARDRAIL_FLAGGED'])(
    'SecurityEventType has %s',
    (member) => {
      expect(prismaEnum('SecurityEventType')).toContain(member);
    },
  );

  it('AiUsageStep has GUARDRAIL', () => {
    expect(prismaEnum('AiUsageStep')).toContain('GUARDRAIL');
  });

  it('apps/api’s hand-copied AiUsageStep union agrees with the schema', () => {
    // That union is a string-literal type written by hand, so this app can
    // stay off the generated client — its own file says "keep in sync with
    // the schema by hand", which is a sentence, not a mechanism.
    //
    // The cost of it being wrong is specific: a step the union omits cannot
    // be passed by any caller in this app, so the usage row is never written
    // and the cost never appears. That is exactly what `GUARDRAIL` would have
    // cost on the API path — the runtime where a judge runs on automated
    // traffic and nobody is watching a page.
    const types = readFileSync(
      join(REPO_ROOT, 'apps', 'api', 'src', 'ai-usage', 'types.ts'),
      'utf8',
    );
    const union = /export type AiUsageStep =([\s\S]*?);/.exec(types)?.[1];

    expect(
      union,
      'AiUsageStep is not a string-literal union here any more',
    ).toBeDefined();
    expect(
      [...(union ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]),
    ).toEqual(prismaEnum('AiUsageStep'));
  });
});

describe('the index Prisma cannot express', () => {
  const migration = readFileSync(
    join(
      REPO_ROOT,
      'prisma',
      'migrations',
      '20260918200000_guardrails',
      'migration.sql',
    ),
    'utf8',
  );

  it('creates the partial unique index on platform keys', () => {
    // `@@unique([organizationId, key])` does not stop two platform rules
    // claiming one built-in, because Postgres treats NULLs as distinct: every
    // platform row is trivially unique on that index by having no
    // organization. Without the partial one the resolver can be handed two
    // verdicts for a single detector and has no defined answer.
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "guardrails_platform_key_unique"[\s\S]*?WHERE "organization_id" IS NULL AND "key" IS NOT NULL/,
    );
  });

  it('marks every seeded override as legacy, and seeds no other kind', () => {
    // An unmarked seeded override would apply in SaaS, where the column it
    // copies is ignored — turning moderation off for tenants that have it on.
    const inserts = [
      ...migration.matchAll(/INSERT INTO "guardrail_org_overrides"[\s\S]*?;/g),
    ];

    expect(inserts).toHaveLength(1);
    expect(inserts[0][0]).toContain('legacy_on_premise');
  });

  it('seeds both built-ins switched off', () => {
    // The safe half of a guess SQL cannot make: it cannot read
    // MODERATION_ENABLED, and no installation should start blocking something
    // it was not blocking.
    const insert = /INSERT INTO "guardrails"[\s\S]*?;/.exec(migration)?.[0];

    expect(insert).toContain("'content-moderation'");
    expect(insert).toContain("'jailbreak-detection'");
    expect(insert).not.toMatch(/,\s*true,\s*'warn'/);
  });
});
