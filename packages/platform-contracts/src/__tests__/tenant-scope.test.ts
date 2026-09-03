import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  TENANT_SCOPED_MODELS,
  WHERE_OPERATIONS,
  isTenantScopeSatisfied,
} from '../tenant-scope/tenant-scope';

// Every member of the guard's WHERE_OPERATIONS set, spelled out rather than
// sampled or derived. Deriving the cases from the exported set would make them
// self-fulfilling — a wrong name over there would become a wrong name to test
// with, and pass. So this list is deliberately a second, independent copy, and
// the first test below is what keeps the two from drifting apart.
const EXPECTED_WHERE_OPERATIONS = [
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
];

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
);

/**
 * Moved here from the two identical copies in apps/web and apps/api. Each app
 * keeps only the tests for its own Prisma extension binding, which is the part
 * that genuinely differs.
 */
describe('WHERE_OPERATIONS', () => {
  it('contains exactly the operations checked against a top-level where', () => {
    expect([...WHERE_OPERATIONS].sort()).toEqual(
      [...EXPECTED_WHERE_OPERATIONS].sort(),
    );
  });
});

describe('isTenantScopeSatisfied', () => {
  it('returns null for a model with no direct tenant-scoping column', () => {
    expect(
      isTenantScopeSatisfied('Message', 'findMany', { where: {} }),
    ).toBeNull();
  });

  it('returns null for an operation it does not understand', () => {
    expect(
      isTenantScopeSatisfied('Project', 'executeRaw', { where: {} }),
    ).toBeNull();
  });

  it.each(EXPECTED_WHERE_OPERATIONS)(
    '%s: passes when organizationId is a defined key in where',
    (operation) => {
      expect(
        isTenantScopeSatisfied('Project', operation, {
          where: { organizationId: 'org-1' },
        }),
      ).toBe(true);
    },
  );

  it.each(EXPECTED_WHERE_OPERATIONS)(
    '%s: fails when where carries no organizationId',
    (operation) => {
      expect(
        isTenantScopeSatisfied('Project', operation, { where: { id: '1' } }),
      ).toBe(false);
    },
  );

  it('fails when where is null rather than an object', () => {
    expect(
      isTenantScopeSatisfied('Project', 'findFirst', { where: null }),
    ).toBe(false);
  });

  it('fails when where is missing entirely', () => {
    expect(isTenantScopeSatisfied('Project', 'findFirst', {})).toBe(false);
  });

  it('fails when args is undefined', () => {
    expect(isTenantScopeSatisfied('Project', 'findMany', undefined)).toBe(
      false,
    );
  });

  it('fails when organizationId is absent from where', () => {
    expect(
      isTenantScopeSatisfied('Project', 'findFirst', { where: { id: '1' } }),
    ).toBe(false);
  });

  it('fails when organizationId is explicitly undefined (Prisma treats this as no filter)', () => {
    expect(
      isTenantScopeSatisfied('Project', 'findFirst', {
        where: { id: '1', organizationId: undefined },
      }),
    ).toBe(false);
  });

  it('checks data for create', () => {
    expect(
      isTenantScopeSatisfied('Project', 'create', {
        data: { organizationId: 'org-1' },
      }),
    ).toBe(true);
    expect(
      isTenantScopeSatisfied('Project', 'create', { data: { title: 'x' } }),
    ).toBe(false);
  });

  it('checks every item for createMany', () => {
    expect(
      isTenantScopeSatisfied('Project', 'createMany', {
        data: [{ organizationId: 'org-1' }, { organizationId: 'org-2' }],
      }),
    ).toBe(true);
    expect(
      isTenantScopeSatisfied('Project', 'createMany', {
        data: [{ organizationId: 'org-1' }, { title: 'missing org' }],
      }),
    ).toBe(false);
    expect(isTenantScopeSatisfied('Project', 'createMany', { data: [] })).toBe(
      false,
    );
  });

  it('accepts a single non-array data object for createMany', () => {
    expect(
      isTenantScopeSatisfied('Project', 'createMany', {
        data: { organizationId: 'org-1' },
      }),
    ).toBe(true);
    expect(
      isTenantScopeSatisfied('Project', 'createMany', {
        data: { title: 'x' },
      }),
    ).toBe(false);
  });

  it('fails createMany when data is absent', () => {
    expect(isTenantScopeSatisfied('Project', 'createMany', {})).toBe(false);
  });

  it('checks both where and create for upsert', () => {
    expect(
      isTenantScopeSatisfied('Project', 'upsert', {
        where: { organizationId: 'org-1', id: '1' },
        create: { organizationId: 'org-1' },
        update: {},
      }),
    ).toBe(true);
    expect(
      isTenantScopeSatisfied('Project', 'upsert', {
        where: { id: '1' },
        create: { organizationId: 'org-1' },
        update: {},
      }),
    ).toBe(false);
  });

  it('uses orgId for DocumentCitation, the naming outlier', () => {
    expect(
      isTenantScopeSatisfied('DocumentCitation', 'findMany', {
        where: { orgId: 'org-1' },
      }),
    ).toBe(true);
    expect(
      isTenantScopeSatisfied('DocumentCitation', 'findMany', {
        where: { organizationId: 'org-1' },
      }),
    ).toBe(false);
  });
});

describe('TENANT_SCOPED_MODELS', () => {
  // The table *is* the guard: a model whose column name is emptied is waved
  // through in silence, which is the cross-org IDOR this file exists to catch.
  // The schema cross-checks below assert the map's *keys* are real models and
  // that the declared field exists on them, but a mutation that empties the
  // *value* here still needs to be caught by exercising the predicate itself.
  it.each(Object.entries(TENANT_SCOPED_MODELS))(
    '%s: is checked against its own scoping column',
    (model, field) => {
      expect(
        isTenantScopeSatisfied(model, 'findFirst', {
          where: { [field]: 'org-1' },
        }),
      ).toBe(true);
      expect(
        isTenantScopeSatisfied(model, 'findFirst', { where: { id: '1' } }),
      ).toBe(false);
    },
  );
});

/**
 * The map names Prisma models by string, so a model renamed in the schema
 * leaves an entry here matching nothing — and the guard then silently stops
 * covering that model, which is the failure mode it exists to prevent.
 */
describe('against prisma/schema.prisma', () => {
  const schema = readFileSync(
    path.join(REPO_ROOT, 'prisma/schema.prisma'),
    'utf8',
  );

  const declared = new Map(
    [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(
      ([, name, body]) => [name, body],
    ),
  );

  it('found the schema models', () => {
    expect(declared.size).toBeGreaterThan(20);
  });

  it.each(Object.entries(TENANT_SCOPED_MODELS))(
    '%s is a model in the schema',
    (model) => {
      expect([...declared.keys()]).toContain(model);
    },
  );

  it.each(Object.entries(TENANT_SCOPED_MODELS))(
    '%s really has the column the guard checks for',
    (model, field) => {
      const body = declared.get(model) ?? '';
      expect(new RegExp(`^\\s*${field}\\s`, 'm').test(body)).toBe(true);
    },
  );

  it('scopes DocumentCitation on orgId, not organizationId', () => {
    // The one naming outlier, called out here so a well-meaning rename is a
    // failing test rather than a guard that quietly stops covering the model.
    expect(TENANT_SCOPED_MODELS.DocumentCitation).toBe('orgId');
  });
});

/**
 * The direction the per-entry checks above cannot see: a model that *has* an
 * org column and is simply absent from the map. The guard then never looks at
 * it, which is indistinguishable from it being safe.
 *
 * `DocumentVersion` was exactly this — added to the schema with an
 * `organization_id` column and never listed here.
 */
describe('coverage of the schema', () => {
  const schema = readFileSync(
    path.join(REPO_ROOT, 'prisma/schema.prisma'),
    'utf8',
  );

  const withOrgColumn = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
    .filter(([, , body]) => /^\s+organizationId\s/m.test(body))
    .map(([, name]) => name);

  it('found models carrying an organization column', () => {
    expect(withOrgColumn.length).toBeGreaterThan(15);
  });

  it('lists every model that has a direct organizationId column', () => {
    const unlisted = withOrgColumn.filter(
      (model) => !(model in TENANT_SCOPED_MODELS),
    );

    expect(
      unlisted,
      [
        'These models have an `organization_id` column but the guard does not',
        'know about them, so a query on one that forgets its org scope is',
        'invisible. Add them to TENANT_SCOPED_MODELS.',
      ].join('\n'),
    ).toEqual([]);
  });
});
