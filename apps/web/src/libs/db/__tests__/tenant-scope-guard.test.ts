import { describe, expect, it, vi } from 'vitest';
import { createTenantScopeWarnExtension } from '../tenant-scope-guard';

/**
 * Only this app's Prisma binding is tested here. `isTenantScopeSatisfied` and
 * the model map moved to `@ragenai/platform-contracts` (ADR-33) and are tested
 * there — which is also where they stopped being two copies that could drift.
 */
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

  // The two shapes that filled the soak-run logs while being scoped: a
  // compound unique key, and Better Auth's adapter writing every multi-field
  // lookup as an `AND`.
  it.each([
    [
      'McpConnector',
      'findUnique',
      {
        where: {
          organizationId_userId_providerSlug: {
            organizationId: 'org-1',
            userId: 'u-1',
            providerSlug: 'SLACK',
          },
        },
      },
    ],
    [
      'Member',
      'findFirst',
      {
        where: {
          AND: [
            { organizationId: { equals: 'org-1' } },
            { userId: { equals: 'u-1' } },
          ],
        },
      },
    ],
  ])('does not report a scoped %s.%s', async (model, operation, args) => {
    const onViolation = vi.fn();
    const config = captureExtensionConfig(onViolation);

    await config.query.$allModels.$allOperations({
      model,
      operation,
      args,
      query: vi.fn().mockResolvedValue(null),
    });

    expect(onViolation).not.toHaveBeenCalled();
  });
});
