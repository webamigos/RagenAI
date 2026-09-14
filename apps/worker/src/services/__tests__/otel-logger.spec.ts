vi.mock('@ragenai/observability', () => ({
  createOtelLogger: vi.fn(() => ({ info: vi.fn() })),
}));

describe('worker otel-logger binding', () => {
  // The binding calls the factory at import time. jest's `clearMocks` wipes
  // that call before the test body runs, so the module is re-imported here —
  // and the mock is fetched *after* resetModules, since the reset hands out a
  // fresh mock instance and a reference captured earlier would see no calls.
  it('binds the shared logger to the ragen-worker scope', async () => {
    // Re-imported after a reset so the module-level call runs again; dynamic
    // import is the ESM equivalent of the `require` this used to do.
    vi.resetModules();
    await import('../otel-logger.js');

    const { createOtelLogger } = await import('@ragenai/observability');
    expect(createOtelLogger).toHaveBeenCalledWith('ragen-worker');
  });
});
