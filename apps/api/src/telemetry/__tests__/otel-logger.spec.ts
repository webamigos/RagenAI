jest.mock('@ragenai/observability', () => ({
  createOtelLogger: jest.fn(() => ({ info: jest.fn() })),
}));

describe('apps/api otel-logger binding', () => {
  // The factory runs at import time and `clearMocks` wipes that call before the
  // test body, so the module is re-imported here — and the mock is fetched
  // after resetModules, which hands out a fresh instance. require() is the only
  // form that re-executes under jest's registry; a dynamic import() resolves
  // from the ESM cache and never re-runs the binding.
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
  it('binds the shared logger to the ragen-api scope', () => {
    jest.resetModules();
    require('../otel-logger.js');

    const { createOtelLogger } = require('@ragenai/observability');
    expect(createOtelLogger).toHaveBeenCalledWith('ragen-api');
  });
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
});
