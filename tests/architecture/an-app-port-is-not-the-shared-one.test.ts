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

    expect(source).toContain("configService.get<number>('RAGEN_API_PORT')");
    // The fallback stays: Railway injects PORT alone.
    expect(source).toContain("configService.get<number>('PORT', 3001)");
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
