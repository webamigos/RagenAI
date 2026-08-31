import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOtelLogger = vi.hoisted(() => vi.fn(() => ({ info: vi.fn() })));

vi.mock('@ragenai/observability', () => ({ createOtelLogger }));

describe('ragen-app otel-logger binding', () => {
  beforeEach(() => {
    // The binding calls the factory at import time, and `clearMocks` wipes that
    // call before the test body runs — so re-import inside the test instead.
    vi.resetModules();
    createOtelLogger.mockClear();
  });

  // The binding's whole job is picking the instrumentation scope. If it drifted,
  // this app's logs would land under another service's scope in the backend.
  it('binds the shared logger to the ragen-app scope', async () => {
    const { otelLogger } = await import('../otel-logger');

    expect(createOtelLogger).toHaveBeenCalledWith('ragen-app');
    expect(otelLogger).toBeDefined();
  });
});
