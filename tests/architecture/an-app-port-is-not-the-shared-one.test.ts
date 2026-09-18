import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * One `.env.local` at the repository root serves every app, and `PORT` is the
 * name several of them read. A value meant for one therefore follows all of
 * them: `PORT=3001` for apps/api put apps/mcp on apps/api's port, where it died
 * with `EADDRINUSE` — and the message names neither app.
 *
 * So each app that listens has a name of its own, which wins over `PORT`. Bare
 * `PORT` stays supported on purpose: a single-container host injects it into
 * one container, where there is nothing to collide with.
 *
 * The Next apps take the other route and pin the port on the command line,
 * which also beats the environment.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function scripts(app: string): Record<string, string> {
  return JSON.parse(read(join('apps', app, 'package.json'))).scripts ?? {};
}

describe('an app port is not the shared one', () => {
  it('has apps/api prefer RAGEN_API_PORT over PORT', () => {
    const source = read('apps/api/src/main.ts');

    // Order matters, so assert it rather than just the presence of both:
    // `resolvePort` takes the first value that is set.
    const api = source.indexOf("get<string>('RAGEN_API_PORT')");
    const bare = source.indexOf("get<string>('PORT')");

    expect(api).toBeGreaterThan(-1);
    // The fallback stays: a single-container host injects PORT alone.
    expect(bare).toBeGreaterThan(-1);
    expect(api).toBeLessThan(bare);
  });

  // `ConfigService` returns what is in `process.env`, which is a string, and
  // neither name is coerced by `apiEnvSchema`. `app.listen()` reads a string as
  // an IPC path, so an unvalidated value binds a pipe and serves nobody while
  // the log line reports it as the port.
  it('converts the chosen port to a validated integer before listening', () => {
    const source = read('apps/api/src/main.ts');

    expect(source).toContain('function resolvePort');
    expect(source).toMatch(/Number\.isInteger\(parsed\)/);
    expect(source).toMatch(/parsed < 1 \|\| parsed > 65535/);
    // Refuses rather than silently falling back to the default.
    expect(source).toMatch(/throw new Error\(\s*`Invalid port/);
  });

  it('has apps/mcp prefer RAGEN_MCP_PORT over PORT', () => {
    const source = read('apps/mcp/src/config/env.ts');

    expect(source).toContain('RAGEN_MCP_PORT');
    expect(source).toContain('env.RAGEN_MCP_PORT ?? env.PORT ?? DEFAULT_PORT');
  });

  it.each([
    ['web', '3000'],
    ['admin', '3200'],
  ])('has apps/%s pin its port on the command line', (app, port) => {
    const { dev, start } = scripts(app);

    expect(dev).toContain(`--port ${port}`);
    expect(start).toContain(`--port ${port}`);
  });

  it('tells the shared env file not to carry a bare PORT', () => {
    const example = read('.env.example');

    expect(example).toMatch(/Do NOT set a bare `PORT` in this file/);
    // And does not itself carry one, which would be the same trap.
    expect(example).not.toMatch(/^PORT=/m);
  });
});
