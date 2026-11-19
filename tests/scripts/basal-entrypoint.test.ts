import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * basal's entrypoint starts from weights that are already on the volume
 * without asking Hugging Face anything.
 *
 * The offline bundle (appliance spec, C2) pre-seeds the `basal_models`
 * volume. That is worth nothing if the entrypoint then calls
 * `snapshot_download`, which goes to the Hub even when every file is there —
 * on a machine with no network, the container would never serve. So a
 * finished download leaves a marker, and a marked folder is served as it is.
 *
 * `python` and `basal-serve` are stand-ins here: the test is about which of
 * them the entrypoint reaches, not about what they do.
 */

const ENTRYPOINT = path.resolve(
  import.meta.dirname,
  '../../infra/basal/entrypoint.sh',
);
const REVISION = 'a'.repeat(40);

let root: string;
let bin: string;

function run(models: string, extra: Record<string, string> = {}) {
  const calls = path.join(root, `calls-${Math.random().toString(36).slice(2)}`);
  writeFileSync(calls, '');
  const result = spawnSync('sh', [ENTRYPOINT], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CALLS: calls,
      BASAL_MODEL: 'Remek/basal-2.0-4.5B',
      BASAL_MODEL_REVISION: REVISION,
      BASAL_MODELS_DIR: models,
      ...extra,
    },
  });
  return {
    result,
    calls: readFileSync(calls, 'utf8').split('\n').filter(Boolean),
  };
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'basal-entrypoint-'));
  bin = path.join(root, 'bin');
  mkdirSync(bin);
  // The download: fails when told to, otherwise creates the folder.
  writeFileSync(
    path.join(bin, 'python'),
    '#!/bin/sh\necho "python $2 $3" >>"$CALLS"\n[ -z "${FAIL_DOWNLOAD:-}" ] || exit 1\nmkdir -p "$4"\n',
  );
  writeFileSync(
    path.join(bin, 'basal-serve'),
    '#!/bin/sh\necho "basal-serve $*" >>"$CALLS"\n',
  );
  chmodSync(path.join(bin, 'python'), 0o755);
  chmodSync(path.join(bin, 'basal-serve'), 0o755);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('infra/basal/entrypoint.sh', () => {
  const folder = (models: string) =>
    path.join(models, `basal-2.0-4.5B@${REVISION}`);

  it('downloads once, marks the folder, then serves it', () => {
    const models = path.join(root, 'first');
    const { result, calls } = run(models);

    expect(result.status).toBe(0);
    expect(calls[0]).toBe(`python Remek/basal-2.0-4.5B ${REVISION}`);
    expect(calls[1]).toContain(`basal-serve --model ${folder(models)}`);
    expect(
      existsSync(path.join(folder(models), '.ragen-snapshot-complete')),
    ).toBe(true);
  });

  it('serves a marked folder without calling the download at all', () => {
    const models = path.join(root, 'seeded');
    run(models, { BASAL_DOWNLOAD_ONLY: '1' });

    const { result, calls } = run(models);
    expect(result.status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('basal-serve');
  });

  it('pre-seeds and stops when asked to download only', () => {
    const models = path.join(root, 'download-only');
    const { result, calls } = run(models, { BASAL_DOWNLOAD_ONLY: '1' });

    expect(result.status).toBe(0);
    expect(calls).toEqual([`python Remek/basal-2.0-4.5B ${REVISION}`]);
    expect(
      existsSync(path.join(folder(models), '.ragen-snapshot-complete')),
    ).toBe(true);
  });

  it('does not mark a download that failed, so the next start resumes it', () => {
    const models = path.join(root, 'failed');
    const { result, calls } = run(models, { FAIL_DOWNLOAD: '1' });

    expect(result.status).not.toBe(0);
    expect(calls).toHaveLength(1);
    expect(
      existsSync(path.join(folder(models), '.ragen-snapshot-complete')),
    ).toBe(false);
  });

  it('still refuses a revision that is not a full commit', () => {
    const { result, calls } = run(path.join(root, 'branch'), {
      BASAL_MODEL_REVISION: 'main',
    });
    expect(result.status).toBe(1);
    expect(calls).toEqual([]);
  });
});
