vi.mock('@ragenai/observability', () => ({
  createOtelLogger: vi.fn(() => ({ info: vi.fn() })),
}));

describe('apps/api otel-logger binding', () => {
  // The factory runs at import time and `clearMocks` wipes that call before the
  // test body, so the module is re-imported here — and the mock is fetched
  // after resetModules, which hands out a fresh instance.
  //
  // Under jest this had to be `require()`: a dynamic `import()` resolved from
  // Node's ESM cache and never re-ran the binding. Vitest runs the suite
  // through its own module registry, which `vi.resetModules()` clears, so the
  // dynamic import re-executes and `require` is not available at all.
  it('binds the shared logger to the ragen-api scope', async () => {
    vi.resetModules();
    await import('../otel-logger.js');

    const { createOtelLogger } = await import('@ragenai/observability');
    expect(createOtelLogger).toHaveBeenCalledWith('ragen-api');
  });
});
