import { describe, expect, it, vi } from 'vitest';

import {
  compareVersions,
  nodeCheck,
  runDoctor,
  type DoctorDeps,
} from '../doctor';

type Reply = { status?: number; body: unknown } | 'refused';

function harness(routes: Record<string, Reply>) {
  const out: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url);
    const key = u.hostname === 'registry.npmjs.org' ? 'npm' : u.pathname;
    const reply = routes[key] ?? { status: 500, body: {} };
    if (reply === 'refused') {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      });
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
    });
  });
  const deps: DoctorDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    env: {},
    stored: { url: 'https://api.example.com', key: 'sk-saved-key.secret' },
    configPath: '/home/a/.config/ragen/config.json',
    version: '0.3.0',
    nodeVersion: 'v24.15.0',
    out: (m) => out.push(m),
    err: () => {},
  };
  return { deps, out, text: () => out.join('\n') };
}

const healthy = {
  npm: { body: { version: '0.3.0' } },
  '/v1/healthcheck': { body: { status: 'ok' } },
  '/v1/models': { body: { data: [{ id: 'gpt-oss-120b' }] } },
  '/v1/brain/next': { body: { message: 'x' } },
} satisfies Record<string, Reply>;

describe('ragen doctor', () => {
  it('passes a healthy setup and says where the connection came from', async () => {
    const { deps, text } = harness(healthy);
    await expect(runDoctor([], deps)).resolves.toBe(0);
    expect(text()).toContain(
      'https://api.example.com (from /home/a/.config/ragen/config.json)',
    );
    expect(text()).toContain('sk-sav…cret');
    expect(text()).toContain('ok    models     gpt-oss-120b');
    expect(text()).not.toContain('sk-saved-key.secret');
  });

  it('prefers the environment to the saved connection, and says so', async () => {
    const { deps, text } = harness(healthy);
    deps.env = { RAGEN_API_URL: 'https://api.example.com/' };
    await runDoctor([], deps);
    expect(text()).toContain('(from RAGEN_API_URL)');
  });

  it('does not probe another address with the saved key', async () => {
    const { deps, text } = harness(healthy);
    deps.env = { RAGEN_API_URL: 'https://other.example.com' };
    await expect(runDoctor([], deps)).resolves.toBe(1);
    expect(text()).toContain(
      'no API key for this address; the saved one is for https://api.example.com and is not sent elsewhere',
    );
    expect(text()).not.toContain('ok    auth');
  });

  it('fails without a connection and points at ragen login', async () => {
    const { deps, text } = harness(healthy);
    deps.stored = undefined;
    await expect(runDoctor([], deps)).resolves.toBe(1);
    expect(text()).toContain('FAIL  url');
    expect(text()).toContain('ragen login --url');
  });

  it('separates an API that does not answer from one that refuses the key', async () => {
    const down = harness({ ...healthy, '/v1/healthcheck': 'refused' });
    await expect(runDoctor([], down.deps)).resolves.toBe(1);
    expect(down.text()).toContain(
      'Cannot reach https://api.example.com (ECONNREFUSED).',
    );

    const refused = harness({
      ...healthy,
      '/v1/models': { status: 401, body: {} },
    });
    await expect(runDoctor([], refused.deps)).resolves.toBe(1);
    expect(refused.text()).toContain('FAIL  auth');
    expect(refused.text()).toContain('Organization → API keys');
  });

  it('recognises the panel’s address given in place of the API’s', async () => {
    const { deps, text } = harness({
      ...healthy,
      '/v1/healthcheck': { status: 404, body: {} },
    });
    await expect(runDoctor([], deps)).resolves.toBe(1);
    expect(text()).toContain("use the API's address");
  });

  it('warns, without failing, about a stale CLI or Brain being off', async () => {
    const { deps, text } = harness({
      ...healthy,
      npm: { body: { version: '0.4.1' } },
      '/v1/brain/next': { status: 404, body: {} },
    });
    await expect(runDoctor([], deps)).resolves.toBe(0);
    expect(text()).toContain('warn  cli        ragen-cli 0.3.0; 0.4.1 is out');
    expect(text()).toContain('-     brain');
  });

  it('is not failed by being offline from npm', async () => {
    const { deps, text } = harness({ ...healthy, npm: 'refused' });
    await expect(runDoctor([], deps)).resolves.toBe(0);
    expect(text()).toContain('could not ask npm');
  });

  it('prints the checks as JSON with --json', async () => {
    const { deps, out } = harness(healthy);
    await runDoctor(['--json'], deps);
    const checks = JSON.parse(out[0]!) as { name: string }[];
    expect(checks.map((c) => c.name)).toEqual([
      'node',
      'cli',
      'url',
      'key',
      'api',
      'auth',
      'models',
      'brain',
    ]);
  });
});

describe('nodeCheck and compareVersions', () => {
  it('fails a Node older than engines allows', () => {
    expect(nodeCheck('v18.20.0').status).toBe('fail');
    expect(nodeCheck('v24.15.0').status).toBe('ok');
  });

  it.each([
    ['0.3.0', '0.3.0', 0],
    ['0.3.0', '0.10.0', -1],
    ['1.0.0', '0.9.9', 1],
    ['0.3.0-beta.1', '0.3.0', 0],
  ])('%s vs %s is %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
