import { createTenantScopeWarnExtension } from './tenant-scope-guard.js';

/**
 * Only this app's Prisma binding is tested here. `isTenantScopeSatisfied` and
 * the model map moved to `@ragenai/platform-contracts` (ADR-33) and are tested
 * there — which is also where they stopped being two copies that could drift.
 */
describe('createTenantScopeWarnExtension', () => {
  // `Prisma.defineExtension(config)` returns `(client) => client.$extends(config)`
  // for a plain-object config — install a fake client that captures whatever
  // config gets passed to `$extends`, exactly like the real one would.
  function captureExtensionConfig(onViolation: (v: unknown) => void) {
    const extensionFn = createTenantScopeWarnExtension(
      onViolation,
    ) as unknown as (client: unknown) => unknown;
    let capturedConfig!: {
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
