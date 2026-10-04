import { describe, expect, it } from 'vitest';

import { runAsk } from '../ask';
import { runAssistants } from '../assistants';
import { runBrain } from '../brain';
import { runDoctor } from '../doctor';
import { runKb } from '../kb';
import { runLogin } from '../login';
import { API_ROUTES } from '../routes';
import { runSearch } from '../search';

/**
 * Runs every command against one fake installation and records the routes
 * it is asked for. The manifest in routes.ts must be exactly that set: a
 * route the CLI calls and the manifest omits is one the architecture guard
 * never checks against apps/api, and a listed route nothing calls is a stale
 * promise. See routes.ts.
 */

const API = 'https://api.example.com';
const FILE = {
  id: 'file-a',
  bytes: 1,
  created_at: 0,
  filename: 'a.md',
  status: 'processed',
};

function fakeInstallation() {
  const called = new Set<string>();
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.origin !== API) {
      // The npm registry, asked by `doctor`; not part of the API.
      return new Response(JSON.stringify({ version: '0.0.0' }));
    }
    const method = init?.method ?? 'GET';
    const path = u.pathname.replace(/^(\/v1\/files\/)[^/]+$/, '$1:id');
    called.add(`${method} ${path}`);

    const json = (body: unknown) => new Response(JSON.stringify(body));
    switch (`${method} ${path}`) {
      case 'GET /v1/files':
        return json({ data: [{ ...FILE, status: 'uploaded' }] });
      case 'POST /v1/files':
        return json({ ...FILE, status: 'uploaded' });
      case 'GET /v1/files/:id':
      case 'DELETE /v1/files/:id':
        return json(FILE);
      case 'POST /v1/search':
        return json({ context: 'x', file_ids: [] });
      case 'POST /v1/chat':
        return JSON.parse(String(init?.body)).stream
          ? new Response('data: {"text":"x"}\n\ndata: [DONE]\n\n')
          : json({ text: 'x' });
      case 'GET /v1/brain/health':
        return json([]);
      case 'GET /v1/brain/findings':
      case 'GET /v1/brain/pages':
        return json([]);
      case 'GET /v1/brain/graph':
        return json({
          shown: { nodes: 0, edges: 0 },
          total: { nodes: 0, edges: 0 },
          hiddenInferred: 0,
          communities: [],
          focus: null,
        });
      case 'GET /v1/brain/export':
        return json({ files: {}, skipped: [] });
      case 'GET /v1/brain/next':
        return json({ message: 'x', path: null, command: null });
      default:
        return json({ data: [], status: 'ok' });
    }
  };
  return { called, fetch: fetchImpl as unknown as typeof fetch };
}

const env = { RAGEN_API_URL: API, RAGEN_API_KEY: 'sk-k.secret-value' };
const quiet = { out: () => {}, err: () => {} };

describe('the route manifest', () => {
  it('is exactly the set of routes the commands call', async () => {
    const { called, fetch } = fakeInstallation();
    const io = { fetch, env, ...quiet };

    await runDoctor([], {
      ...io,
      env: {},
      stored: { url: API, key: env.RAGEN_API_KEY },
      configPath: '/c',
      version: '0.0.0',
      nodeVersion: 'v24.0.0',
    });
    await runLogin(['--url', API, '--api-key', env.RAGEN_API_KEY], {
      ...io,
      configPath: '/c',
      readKey: async () => '',
      saveConfig: async () => {},
      removeConfig: async () => true,
    });

    let clock = 0;
    const kb = {
      ...io,
      readFile: async () => new Uint8Array([1]),
      sleep: async (ms: number) => {
        clock += ms;
      },
      now: () => clock,
    };
    await runKb(['ls'], kb);
    await runKb(['upload', './a.md', '--wait'], kb);
    // Not on the newest page, so it is asked for by id.
    await runKb(['status', 'file-elsewhere'], kb);
    await runKb(['rm', 'file-a'], kb);

    await runSearch(['q'], io);
    await runAsk(['q'], { ...io, write: () => {} });
    await runAssistants(['ls'], io);

    const brain = { ...io, writeFile: async () => {}, mkdir: async () => {} };
    for (const command of ['next', 'doctor', 'findings', 'pages', 'graph']) {
      await runBrain([command], brain);
    }
    await runBrain(['query', 'q'], brain);
    await runBrain(['export', './out'], brain);

    expect([...called].sort()).toEqual([...API_ROUTES].sort());
  });
});
