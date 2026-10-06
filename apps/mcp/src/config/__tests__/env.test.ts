import {
  DEV_SERVER_VERSION,
  getEnv,
  mcpEnvSchema,
  resetEnvCache,
} from '../env.js';

const ORIGINAL_ENV = process.env;

function withEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...overrides } as NodeJS.ProcessEnv;
  resetEnvCache();
  return getEnv();
}

describe('mcpEnvSchema', () => {
  it('needs only TARGET_ENV — every other value has a working local default', () => {
    const env = mcpEnvSchema.parse({ TARGET_ENV: 'local' });

    expect(env.PORT).toBe(3300);
    expect(env.RAGEN_API_URL).toBe('http://localhost:3001');
    expect(env.TARGET_ENV).toBe('local');
  });

  // The variable that decides whether a rule applies must not have a
  // forgiving default. Unset on a deployment, `targetEnv` would read as
  // `local`, the RAGEN_API_URL refinement would never fire, and the server
  // would boot clean and pointed at a localhost that is not there.
  it('refuses to start without TARGET_ENV rather than assuming local', () => {
    expect(() => mcpEnvSchema.parse({})).toThrow();
  });

  // The root `.env.local` is shared by every app in the monorepo, so a `PORT`
  // meant for one of them followed all of them: `PORT=3001` for apps/api put
  // this server on apps/api's port, where it died with EADDRINUSE. The
  // app-specific name is how one shared file gives each app its own port;
  // bare `PORT` stays supported because that is what a single-container host
  // injects.
  it('prefers RAGEN_MCP_PORT over a PORT meant for another app', () => {
    expect(
      mcpEnvSchema.parse({
        TARGET_ENV: 'local',
        RAGEN_MCP_PORT: '3300',
        PORT: '3001',
      }).PORT,
    ).toBe(3300);
  });

  it('still honours a bare PORT when no app-specific one is set', () => {
    expect(mcpEnvSchema.parse({ TARGET_ENV: 'local', PORT: '8080' }).PORT).toBe(
      8080,
    );
  });

  it('coerces PORT, which arrives as a string from the environment', () => {
    expect(mcpEnvSchema.parse({ TARGET_ENV: 'local', PORT: '8080' }).PORT).toBe(
      8080,
    );
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
    expect(mcpEnvSchema.parse({ TARGET_ENV: 'local', PORT: '1' }).PORT).toBe(1);
    expect(
      mcpEnvSchema.parse({ TARGET_ENV: 'local', PORT: '65535' }).PORT,
    ).toBe(65535);
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

  it('serves HTTP unless stdio is asked for', () => {
    expect(
      mcpEnvSchema.parse({ TARGET_ENV: 'local' }).RAGEN_MCP_TRANSPORT,
    ).toBe('http');
    // A compose file that passes `${RAGEN_MCP_TRANSPORT:-}` hands over an
    // empty string, which means unset, not an invalid transport.
    expect(
      mcpEnvSchema.parse({ TARGET_ENV: 'local', RAGEN_MCP_TRANSPORT: '' })
        .RAGEN_MCP_TRANSPORT,
    ).toBe('http');
    expect(
      mcpEnvSchema.parse({ TARGET_ENV: 'local', RAGEN_MCP_TRANSPORT: 'stdio' })
        .RAGEN_MCP_TRANSPORT,
    ).toBe('stdio');
  });

  it('refuses a transport it does not serve, rather than falling back to HTTP', () => {
    expect(
      mcpEnvSchema.safeParse({
        TARGET_ENV: 'local',
        RAGEN_MCP_TRANSPORT: 'sse',
      }).success,
    ).toBe(false);
  });

  it('reads RAGEN_API_KEY trimmed, and a blank one as unset', () => {
    expect(
      mcpEnvSchema.parse({ TARGET_ENV: 'local', RAGEN_API_KEY: ' sk-a.b\n' })
        .RAGEN_API_KEY,
    ).toBe('sk-a.b');
    expect(
      mcpEnvSchema.parse({ TARGET_ENV: 'local', RAGEN_API_KEY: '' })
        .RAGEN_API_KEY,
    ).toBeUndefined();
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
    expect(withEnv({ TARGET_ENV: 'local', PORT: '3399' }).PORT).toBe(3399);
  });

  it('caches, so nothing downstream re-reads process.env and gets a different answer', () => {
    const first = withEnv({
      TARGET_ENV: 'local',
      RAGEN_API_URL: 'http://api.internal:3001',
    });
    process.env.RAGEN_API_URL = 'http://somewhere-else:9999';

    expect(getEnv()).toBe(first);
    expect(getEnv().RAGEN_API_URL).toBe('http://api.internal:3001');
  });

  it('throws rather than exiting, so a bad variable cannot kill a test run', () => {
    // The reason this is lazy: a module-scope process.exit would take a
    // whole Jest run down from an unrelated variable, with no failing
    // assertion to explain it.
    expect(() =>
      withEnv({
        TARGET_ENV: 'local',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'localhost:4318',
      }),
    ).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
  });
});

describe('SERVER_VERSION', () => {
  const parse = (env: Record<string, string>) =>
    mcpEnvSchema.parse({ TARGET_ENV: 'local', ...env }).SERVER_VERSION;

  it('is the release tag the image was built with', () => {
    expect(
      parse({ RAGEN_VERSION: '2.32.8', RAILWAY_GIT_COMMIT_SHA: 'abc123' }),
    ).toBe('2.32.8');
  });

  it('falls back to the Railway commit sha when no release was named', () => {
    expect(parse({ RAILWAY_GIT_COMMIT_SHA: 'abc123' })).toBe('abc123');
  });

  it('is dev when the build named neither', () => {
    expect(parse({})).toBe(DEV_SERVER_VERSION);
  });

  // `ARG RAGEN_VERSION` with no value passed still sets
  // `ENV RAGEN_VERSION=` in the image — every compose and Railway build.
  it('reads an empty RAGEN_VERSION as unset, not as the version', () => {
    expect(parse({ RAGEN_VERSION: '', RAILWAY_GIT_COMMIT_SHA: 'abc123' })).toBe(
      'abc123',
    );
    expect(parse({ RAGEN_VERSION: '  ', RAILWAY_GIT_COMMIT_SHA: '' })).toBe(
      DEV_SERVER_VERSION,
    );
  });
});

describe('MCP OAuth resource configuration', () => {
  const valid = {
    TARGET_ENV: 'local',
    MCP_OAUTH_ENABLED: 'true',
    BETTER_AUTH_URL: 'http://localhost:3000',
    RAGEN_MCP_PUBLIC_URL: 'https://mcp.example/mcp',
    MCP_SERVICE_SECRET: 'm'.repeat(32),
  };
  it('requires both the resource URL and dedicated service credential', () => {
    expect(mcpEnvSchema.safeParse(valid).success).toBe(true);
    expect(
      mcpEnvSchema.safeParse({ ...valid, RAGEN_MCP_PUBLIC_URL: undefined })
        .success,
    ).toBe(false);
    expect(
      mcpEnvSchema.safeParse({ ...valid, MCP_SERVICE_SECRET: undefined })
        .success,
    ).toBe(false);
  });
  it('refuses reusing the session credential', () => {
    expect(
      mcpEnvSchema.safeParse({
        ...valid,
        SESSION_AUTH_SECRET: valid.MCP_SERVICE_SECRET,
      }).success,
    ).toBe(false);
  });
});

it.each([
  'http://auth.example',
  'https://auth.example/api/auth',
  Object.assign(new URL('https://auth.example'), { username: 'user', password: 'password' }).href,
  'https://auth.example?query=1',
  'https://auth.example#fragment',
])('rejects an unsafe OAuth issuer origin %s', (BETTER_AUTH_URL) => {
  expect(
    mcpEnvSchema.safeParse({
      TARGET_ENV: 'local',
      MCP_OAUTH_ENABLED: 'true',
      RAGEN_MCP_PUBLIC_URL: 'https://mcp.example/mcp',
      MCP_SERVICE_SECRET: 'm'.repeat(32),
      BETTER_AUTH_URL,
    }).success,
  ).toBe(false);
});
