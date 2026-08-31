jest.mock('@ragenai/observability', () => ({
  createOtelLogger: jest.fn(() => ({ info: jest.fn() })),
}));

describe('worker otel-logger binding', () => {
  // The binding calls the factory at import time. jest's `clearMocks` wipes
  // that call before the test body runs, so the module is re-imported here —
  // and the mock is fetched *after* resetModules, since the reset hands out a
  // fresh mock instance and a reference captured earlier would see no calls.
  /* eslint-disable @typescript-eslint/no-require-imports */
  it('binds the shared logger to the ragen-worker scope', () => {
    jest.resetModules();
    require('../otel-logger');

    const { createOtelLogger } = require('@ragenai/observability');
    expect(createOtelLogger).toHaveBeenCalledWith('ragen-worker');
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
});
