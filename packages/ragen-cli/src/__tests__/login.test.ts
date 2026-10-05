import { describe, expect, it, vi } from 'vitest';

import { runLogin, runLogout, type LoginDeps } from '../login';

function harness(status = 200, body: unknown = { data: [{ id: 'm' }] }) {
  const out: string[] = [];
  const err: string[] = [];
  const saved = new Map<string, string>();
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  const deps: LoginDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    env: {},
    configPath: '/home/a/.config/ragen/config.json',
    readKey: vi.fn(async () => 'sk-prompted-key.secret'),
    saveConfig: async (path, content) => {
      saved.set(path, content);
    },
    removeConfig: vi.fn(async () => true),
    out: (m) => out.push(m),
    err: (m) => err.push(m),
  };
  return { deps, out, err, saved, fetchMock };
}

describe('ragen login', () => {
  it('checks the key against /v1/models, then saves the URL and key', async () => {
    const { deps, out, saved, fetchMock } = harness();
    await expect(
      runLogin(['--url', 'https://api.example.com/v1/'], deps),
    ).resolves.toBe(0);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://api.example.com/v1/models',
    );
    expect(JSON.parse(saved.get(deps.configPath)!)).toEqual({
      url: 'https://api.example.com',
      key: 'sk-prompted-key.secret',
    });
    expect(out[0]).toBe(
      'Logged in to https://api.example.com with sk-pro…cret (1 model(s) available).',
    );
    // The full key is never printed.
    expect(out.join('\n')).not.toContain('sk-prompted-key.secret');
  });

  it('saves nothing when the key is refused', async () => {
    const { deps, err, saved } = harness(401, {
      error: { message: 'Invalid API key' },
    });
    await expect(
      runLogin(['--url', 'https://api.example.com'], deps),
    ).resolves.toBe(1);
    expect(saved.size).toBe(0);
    expect(err).toEqual([
      'The API key was refused. (Invalid API key)',
      'Nothing was saved.',
    ]);
  });

  it('takes the key from --api-key or RAGEN_API_KEY before asking', async () => {
    const { deps, saved } = harness();
    deps.env = {
      RAGEN_API_KEY: 'sk-from-env.secret',
      RAGEN_API_URL: 'https://e',
    };
    await expect(runLogin([], deps)).resolves.toBe(0);
    expect(deps.readKey).not.toHaveBeenCalled();
    expect(JSON.parse(saved.get(deps.configPath)!)).toEqual({
      url: 'https://e',
      key: 'sk-from-env.secret',
    });
  });

  it('asks for an address when it has none', async () => {
    const { deps, err } = harness();
    await expect(runLogin([], deps)).resolves.toBe(1);
    expect(err[0]).toMatch(/ragen login --url/);
  });

  it('names an unreachable address instead of "fetch failed"', async () => {
    const { deps, err } = harness();
    deps.fetch = vi.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      });
    }) as unknown as typeof fetch;
    await expect(runLogin(['--url', 'http://localhost:9'], deps)).resolves.toBe(
      1,
    );
    expect(err[0]).toBe('Cannot reach http://localhost:9 (ECONNREFUSED).');
  });

  it('warns when the key would travel over plain http to another host', async () => {
    const { deps, err } = harness();
    await expect(
      runLogin(['--url', 'http://ragen.internal'], deps),
    ).resolves.toBe(0);
    expect(err[0]).toMatch(/unencrypted/);
  });

  it('does not warn about http on localhost', async () => {
    const { deps, err } = harness();
    await expect(
      runLogin(['--url', 'http://localhost:3001'], deps),
    ).resolves.toBe(0);
    expect(err).toEqual([]);
  });
});

describe('ragen logout', () => {
  it('removes the saved connection, and says so when there was none', async () => {
    const { deps, out } = harness();
    await expect(runLogout([], deps)).resolves.toBe(0);
    expect(out[0]).toMatch(/^Logged out: removed /);
    deps.removeConfig = vi.fn(async () => false);
    await runLogout([], deps);
    expect(out[1]).toMatch(/Not logged in/);
  });
});
