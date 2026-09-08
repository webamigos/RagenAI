import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  findRepositoryRoot,
  loadLocalEnv,
  localEnvCandidates,
} from '../load-local-env.js';

const KEYS = ['LLE_APP', 'LLE_ROOT', 'LLE_REAL', 'LLE_LOCAL'] as const;

let root: string;
let app: string;
const before: Record<string, string | undefined> = {};

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'lle-'));
  app = path.join(root, 'apps', 'api');
  mkdirSync(app, { recursive: true });
  writeFileSync(path.join(root, 'turbo.json'), '{}');
  // The stale lockfile apps/api really has, which must not count as a root.
  writeFileSync(path.join(app, 'package-lock.json'), '{}');
  for (const key of KEYS) {
    before[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  for (const key of KEYS) {
    if (before[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = before[key];
    }
  }
});

describe('findRepositoryRoot', () => {
  it('walks up to the directory holding turbo.json, past the app lockfile', () => {
    expect(findRepositoryRoot(app)).toBe(root);
  });

  it('returns null when nothing above looks like the repository', () => {
    // A different marker nobody wrote, so the walk reaches the filesystem
    // root and has to stop rather than loop.
    expect(findRepositoryRoot(app, 'no-such-marker.txt')).toBeNull();
  });
});

describe('localEnvCandidates', () => {
  it('lists the app files before the root files, .env.local before .env', () => {
    expect(localEnvCandidates({ cwd: app })).toEqual([
      path.join(app, '.env.local'),
      path.join(app, '.env'),
      path.join(root, '.env.local'),
      path.join(root, '.env'),
    ]);
  });

  it('does not list the root twice when the app is the root', () => {
    expect(localEnvCandidates({ cwd: root })).toEqual([
      path.join(root, '.env.local'),
      path.join(root, '.env'),
    ]);
  });
});

describe('loadLocalEnv', () => {
  it('fills gaps from the root without touching what the app set', () => {
    // The case this exists for: DATABASE_URL lives in the root .env.local,
    // and only apps/api-specific values in the app's own file.
    writeFileSync(
      path.join(app, '.env'),
      'LLE_APP=from-app\nLLE_LOCAL=app-wins\n',
    );
    writeFileSync(
      path.join(root, '.env.local'),
      'LLE_ROOT=from-root\nLLE_LOCAL=root-loses\n',
    );

    const loaded = loadLocalEnv({ cwd: app });

    expect(loaded).toEqual([
      path.join(app, '.env'),
      path.join(root, '.env.local'),
    ]);
    expect(process.env.LLE_APP).toBe('from-app');
    expect(process.env.LLE_ROOT).toBe('from-root');
    expect(process.env.LLE_LOCAL).toBe('app-wins');
  });

  it('never overwrites a real environment variable', () => {
    process.env.LLE_REAL = 'from-container';
    writeFileSync(path.join(root, '.env.local'), 'LLE_REAL=from-file\n');

    loadLocalEnv({ cwd: app });

    expect(process.env.LLE_REAL).toBe('from-container');
  });

  it('is a no-op when no file exists, as in the production image', () => {
    expect(loadLocalEnv({ cwd: app })).toEqual([]);
  });
});
