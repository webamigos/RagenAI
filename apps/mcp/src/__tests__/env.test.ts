import { getEnv, mcpEnvSchema, resetEnvCache } from '../env.js';

const ORIGINAL_ENV = process.env;

function withEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...overrides } as NodeJS.ProcessEnv;
  resetEnvCache();
  return getEnv();
}

describe('mcpEnvSchema', () => {
  it('needs nothing at all — every value has a working local default', () => {
    const env = mcpEnvSchema.parse({});

    expect(env.PORT).toBe(3300);
    expect(env.RAGEN_API_URL).toBe('http://localhost:3001');
    expect(env.TARGET_ENV).toBe('local');
  });

  it('coerces PORT, which arrives as a string from the environment', () => {
    expect(mcpEnvSchema.parse({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a PORT that is not a positive integer', () => {
    expect(mcpEnvSchema.safeParse({ PORT: 'abc' }).success).toBe(false);
    expect(mcpEnvSchema.safeParse({ PORT: '0' }).success).toBe(false);
    expect(mcpEnvSchema.safeParse({ PORT: '-1' }).success).toBe(false);
  });

  it('rejects a scheme-less RAGEN_API_URL', () => {
    expect(
      mcpEnvSchema.safeParse({ RAGEN_API_URL: 'localhost:3001' }).success,
    ).toBe(false);
  });
});

describe('getEnv', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    resetEnvCache();
  });

  it('returns the parsed environment', () => {
    expect(withEnv({ PORT: '3399' }).PORT).toBe(3399);
  });

  it('caches, so nothing downstream re-reads process.env and gets a different answer', () => {
    const first = withEnv({ RAGEN_API_URL: 'http://api.internal:3001' });
    process.env.RAGEN_API_URL = 'http://somewhere-else:9999';

    expect(getEnv()).toBe(first);
    expect(getEnv().RAGEN_API_URL).toBe('http://api.internal:3001');
  });

  it('throws rather than exiting, so a bad variable cannot kill a test run', () => {
    // The reason this is lazy: a module-scope process.exit would take a
    // whole Jest run down from an unrelated variable, with no failing
    // assertion to explain it.
    expect(() =>
      withEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'localhost:4318' }),
    ).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
  });
});
