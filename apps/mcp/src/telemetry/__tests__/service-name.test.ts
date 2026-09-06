const ORIGINAL_ENV = process.env.OTEL_SERVICE_NAME;

async function loadResolveServiceName(): Promise<() => string> {
  jest.resetModules();
  const mod = await import('../service-name.js');
  return mod.resolveServiceName;
}

describe('resolveServiceName', () => {
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.OTEL_SERVICE_NAME;
    } else {
      process.env.OTEL_SERVICE_NAME = ORIGINAL_ENV;
    }
  });

  it('falls back to ragen-mcp when OTEL_SERVICE_NAME is unset', async () => {
    delete process.env.OTEL_SERVICE_NAME;
    const resolveServiceName = await loadResolveServiceName();

    expect(resolveServiceName()).toBe('ragen-mcp');
  });

  it('prefers OTEL_SERVICE_NAME when it is set', async () => {
    process.env.OTEL_SERVICE_NAME = 'ragen-mcp-staging';
    const resolveServiceName = await loadResolveServiceName();

    expect(resolveServiceName()).toBe('ragen-mcp-staging');
  });

  it('ignores a whitespace-only OTEL_SERVICE_NAME', async () => {
    // An env var set to '' or ' ' in a deploy config is a real shape — it
    // must not become the service name every span is filed under.
    process.env.OTEL_SERVICE_NAME = '   ';
    const resolveServiceName = await loadResolveServiceName();

    expect(resolveServiceName()).toBe('ragen-mcp');
  });
});
