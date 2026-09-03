import {
  createTenantScopeWarnExtension,
  isTenantScopeSatisfied,
  TENANT_SCOPED_MODELS,
  WHERE_OPERATIONS,
} from './tenant-scope-guard.js';

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

describe('WHERE_OPERATIONS', () => {
  it('contains exactly the operations checked against a top-level where', () => {
    expect([...WHERE_OPERATIONS].sort()).toEqual(
      [...EXPECTED_WHERE_OPERATIONS].sort(),
    );
  });
});

describe('TENANT_SCOPED_MODELS', () => {
  // The table *is* the guard: a model whose column name is wrong or empty is
  // waved through in silence, which is the cross-org IDOR this file exists to
  // catch. Assert the shape of every entry, not a sample of them.
  it('scopes every model by organizationId, DocumentCitation excepted', () => {
    expect(Object.keys(TENANT_SCOPED_MODELS).length).toBeGreaterThan(0);

    for (const [model, field] of Object.entries(TENANT_SCOPED_MODELS)) {
      expect(field).toBe(
        model === 'DocumentCitation' ? 'orgId' : 'organizationId',
      );
    }
  });

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

describe('isTenantScopeSatisfied', () => {
  it('returns null for a model with no direct tenant-scoping column', () => {
    expect(isTenantScopeSatisfied('Message', 'findMany', { where: {} })).toBe(
      null,
    );
  });

  it('returns null for an operation it does not understand', () => {
    expect(isTenantScopeSatisfied('Project', 'executeRaw', { where: {} })).toBe(
      null,
    );
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

  it('fails when args is absent entirely', () => {
    expect(isTenantScopeSatisfied('Project', 'findFirst', undefined)).toBe(
      false,
    );
  });

  it('fails when where is null rather than an object', () => {
    expect(
      isTenantScopeSatisfied('Project', 'findFirst', { where: null }),
    ).toBe(false);
  });

  it('fails when where is missing entirely', () => {
    expect(isTenantScopeSatisfied('Project', 'findFirst', {})).toBe(false);
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

describe('createTenantScopeWarnExtension', () => {
  // `Prisma.defineExtension(config)` returns `(client) => client.$extends(config)`
  // for a plain-object config — install a fake client that captures whatever
  // config gets passed to `$extends`, exactly like the real one would.
  function captureExtensionConfig(onViolation: (v: unknown) => void) {
    const extensionFn = createTenantScopeWarnExtension(
      onViolation,
    ) as unknown as (client: unknown) => unknown;
    let capturedConfig!: {
      name: string;
      query: {
        $allModels: {
          $allOperations: (input: {
            model: string;
            operation: string;
            args: Record<string, unknown>;
            query: (args: unknown) => Promise<unknown>;
          }) => Promise<unknown>;
        };
      };
    };
    extensionFn({
      $extends: (config: typeof capturedConfig) => {
        capturedConfig = config;
      },
    });
    return capturedConfig;
  }

  it('registers under a stable extension name', () => {
    expect(captureExtensionConfig(jest.fn()).name).toBe('tenant-scope-warn');
  });

  it('calls onViolation and still runs the query when scope is missing', async () => {
    const onViolation = jest.fn();
    const config = captureExtensionConfig(onViolation);
    const query = jest.fn().mockResolvedValue('result');

    const result = await config.query.$allModels.$allOperations({
      model: 'Project',
      operation: 'findFirst',
      args: { where: { id: '1' } },
      query,
    });

    expect(onViolation).toHaveBeenCalledWith({
      model: 'Project',
      operation: 'findFirst',
    });
    expect(query).toHaveBeenCalledWith({ where: { id: '1' } });
    expect(result).toBe('result');
  });

  it('does not call onViolation when scope is present', async () => {
    const onViolation = jest.fn();
    const config = captureExtensionConfig(onViolation);
    const query = jest.fn().mockResolvedValue('result');

    await config.query.$allModels.$allOperations({
      model: 'Project',
      operation: 'findFirst',
      args: { where: { id: '1', organizationId: 'org-1' } },
      query,
    });

    expect(onViolation).not.toHaveBeenCalled();
  });
});
