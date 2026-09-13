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

  it.each([
    ['abc', 'not a number'],
    ['0', 'zero'],
    ['-1', 'negative'],
    ['1.5', 'fractional — coercion accepts it, .int() is what rejects it'],
    ['65536', 'above the highest valid port'],
    ['', 'empty, which coerces to 0'],
  ])('rejects PORT=%j (%s)', (port) => {
    expect(mcpEnvSchema.safeParse({ PORT: port }).success).toBe(false);
  });

  it('accepts the boundary ports', () => {
    expect(mcpEnvSchema.parse({ PORT: '1' }).PORT).toBe(1);
    expect(mcpEnvSchema.parse({ PORT: '65535' }).PORT).toBe(65535);
  });

  it('requires RAGEN_API_URL in a deployed environment, despite having a default', () => {
    // The reason RAGEN_API_URL is `.optional()` plus a transform rather than
    // `.default()`: a Zod default is applied before superRefine runs, so the
    // required-check would see the localhost fallback already filled in and
    // never fire. A deployed server pointed at localhost answers every tool
    // call with a connection error.
    for (const TARGET_ENV of ['staging', 'production']) {
      const result = mcpEnvSchema.safeParse({ TARGET_ENV });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path[0]).toBe('RAGEN_API_URL');
      }
    }
  });

  it('accepts an explicit RAGEN_API_URL in a deployed environment', () => {
    const result = mcpEnvSchema.parse({
      TARGET_ENV: 'production',
      RAGEN_API_URL: 'http://ragen-api.railway.internal:3001',
    });

    expect(result.RAGEN_API_URL).toBe('http://ragen-api.railway.internal:3001');
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
