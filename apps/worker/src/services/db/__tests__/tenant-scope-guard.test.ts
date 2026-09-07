import { createTenantScopeWarnExtension } from '../tenant-scope-guard';

/**
 * This tests the *wiring*, not the predicate. Whether a given `where` clause
 * satisfies the org scope is `@ragenai/platform-contracts`' job and is tested
 * there; what can only break here is whether this app's extension calls it,
 * reports the right model and operation, and lets the query through either
 * way.
 *
 * The last part is the one worth guarding: the guard is warn-only by design,
 * so an extension that blocked a query would be a regression that no
 * type-checker would catch.
 */

type Handler = (params: {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

/**
 * Pulls the `$allOperations` handler out of the extension, so the test drives
 * the same function Prisma would.
 *
 * `Prisma.defineExtension` does not return the definition object — it returns
 * a function that takes a client and calls `client.$extends(definition)`. So
 * the way to reach the handler is to hand it a stand-in client whose
 * `$extends` captures its argument, which is also what Prisma itself does.
 */
function handlerFrom(
  extension: ReturnType<typeof createTenantScopeWarnExtension>,
): Handler {
  let definition: { query: { $allModels: { $allOperations: Handler } } };

  const captor = {
    $extends: (received: typeof definition) => {
      definition = received;
      return received;
    },
  };

  (extension as unknown as (client: typeof captor) => unknown)(captor);

  return definition!.query.$allModels.$allOperations;
}

describe('the worker binding of the tenant-scope guard', () => {
  it('reports a tenant-scoped query that carries no org filter', async () => {
    const violations: { model: string; operation: string }[] = [];
    const handler = handlerFrom(
      createTenantScopeWarnExtension((v) => violations.push(v)),
    );

    await handler({
      model: 'Thread',
      operation: 'findMany',
      args: { where: { id: 1 } },
      query: async () => [],
    });

    expect(violations).toEqual([{ model: 'Thread', operation: 'findMany' }]);
  });

  it('stays quiet when the org filter is there', async () => {
    const violations: unknown[] = [];
    const handler = handlerFrom(
      createTenantScopeWarnExtension((v) => violations.push(v)),
    );

    await handler({
      model: 'Thread',
      operation: 'findMany',
      args: { where: { organizationId: 'org_1' } },
      query: async () => [],
    });

    expect(violations).toEqual([]);
  });

  // `Settings` is keyed by nothing but its own `key` column and is genuinely
  // absent from TENANT_SCOPED_MODELS — the assertion below would pass for any
  // unknown string, so the model is chosen to be a real counter-example rather
  // than a typo that happens to look like one.
  it('says nothing about a model that is not tenant-scoped', async () => {
    const violations: unknown[] = [];
    const handler = handlerFrom(
      createTenantScopeWarnExtension((v) => violations.push(v)),
    );

    await handler({
      model: 'Settings',
      operation: 'findMany',
      args: {},
      query: async () => [],
    });

    expect(violations).toEqual([]);
  });

  // Warn-only is the whole design. An extension that swallowed or blocked the
  // query would turn a diagnostic into an outage.
  it('runs the query and returns its result even when it warns', async () => {
    const handler = handlerFrom(createTenantScopeWarnExtension(() => {}));
    const rows = [{ id: 'thread_1' }];

    const result = await handler({
      model: 'Thread',
      operation: 'findMany',
      args: { where: {} },
      query: async () => rows,
    });

    expect(result).toBe(rows);
  });

  it('passes the args through to the query untouched', async () => {
    const handler = handlerFrom(createTenantScopeWarnExtension(() => {}));
    const args = { where: { organizationId: 'org_1' }, take: 5 };
    let seen: unknown;

    await handler({
      model: 'Thread',
      operation: 'findMany',
      args,
      query: async (received) => {
        seen = received;
        return [];
      },
    });

    expect(seen).toBe(args);
  });
});
