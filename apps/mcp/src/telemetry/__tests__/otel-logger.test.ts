import { createOtelLogger } from '@ragenai/observability';

vi.mock('@ragenai/observability', () => ({
  createOtelLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('otelLogger', () => {
  it("is built for this app's own instrumentation scope", async () => {
    // A wrong scope name is invisible until someone goes looking for logs
    // that were filed under a service that does not exist (ADR-28).
    await import('../otel-logger.js');

    expect(createOtelLogger).toHaveBeenCalledWith('ragen-mcp');
  });
});
