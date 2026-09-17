import { describe, expect, it, vi } from 'vitest';

import { CREATE_PACKAGE, runCreate, type Spawn } from '../create';

describe('runCreate', () => {
  it('invokes the published scaffolder through npx, inheriting stdio', () => {
    const spawn = vi.fn(() => ({ status: 0 })) as unknown as Spawn;

    expect(runCreate(['./app'], spawn)).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['--yes', CREATE_PACKAGE, './app'],
      { stdio: 'inherit' },
    );
  });

  it('passes the exit code straight through', () => {
    const spawn = vi.fn(() => ({ status: 3 })) as unknown as Spawn;
    expect(runCreate([], spawn)).toBe(3);
  });

  it('treats a signal kill as a failure, not a finished install', () => {
    // spawnSync reports status null when the child was killed — Ctrl+C during
    // the wizard must not look like a completed scaffold.
    const spawn = vi.fn(() => ({ status: null })) as unknown as Spawn;
    expect(runCreate([], spawn)).toBe(1);
  });

  it('prints the command to run by hand when npx is missing', () => {
    const spawn = vi.fn(() => ({
      status: null,
      error: new Error('spawnSync npx ENOENT'),
    })) as unknown as Spawn;
    const log = vi.fn();

    expect(runCreate(['./app'], spawn, log)).toBe(1);
    expect(log.mock.calls[0]?.[0]).toContain(`npx ${CREATE_PACKAGE} ./app`);
  });
});
