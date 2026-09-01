import { describe, expect, it, vi } from 'vitest';
import {
  createTenantScopeWarnExtension,
  isTenantScopeSatisfied,
} from '../tenant-scope-guard';

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

  it.each(['findMany', 'findFirst', 'update', 'deleteMany', 'count'])(
    '%s: passes when organizationId is a defined key in where',
    (operation) => {
      expect(
        isTenantScopeSatisfied('Project', operation, {
          where: { organizationId: 'org-1' },
        }),
      ).toBe(true);
    },
  );

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
  // for a plain-object config (see @prisma/client's runtime source) — so to reach
  // the actual `$allOperations` interceptor we install a fake client that captures
  // whatever config gets passed to `$extends`, exactly like the real one would.
  function captureExtensionConfig(onViolation: (v: unknown) => void) {
    const extensionFn = createTenantScopeWarnExtension(
      onViolation as (violation: { model: string; operation: string }) => void,
    ) as unknown as (client: unknown) => unknown;
    let capturedConfig: {
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
    return capturedConfig!;
  }

  it('calls onViolation and still runs the query when scope is missing', async () => {
    const onViolation = vi.fn();
    const config = captureExtensionConfig(onViolation);
    const query = vi.fn().mockResolvedValue('result');

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
    const onViolation = vi.fn();
    const config = captureExtensionConfig(onViolation);
    const query = vi.fn().mockResolvedValue('result');

    await config.query.$allModels.$allOperations({
      model: 'Project',
      operation: 'findFirst',
      args: { where: { id: '1', organizationId: 'org-1' } },
      query,
    });

    expect(onViolation).not.toHaveBeenCalled();
  });
});
