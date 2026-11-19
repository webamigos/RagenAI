import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `infra/appliance/backup.sh`, run for real against a stub `docker` and a
 * stub `curl`.
 *
 * No test here can prove a dump restores — that needs a stack. What it can
 * hold is everything the script decides around the three commands: that the
 * writers it stopped come back on every exit, that a failed step never leaves
 * a directory that looks like a complete set, that nothing is stopped before
 * a refusal, and that retention deletes sets and only sets.
 */

const SCRIPT = fileURLToPath(
  new URL('../../infra/appliance/backup.sh', import.meta.url),
);

let root: string;
let checkout: string;
let bin: string;
let target: string;
let calls: string;

const DOCKER_STUB = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >>"$CALLS"
case "$*" in
  "compose ps --services --status running") printf '%s\\n' $RUNNING ;;
  "compose start"*) [ -z "\${FAIL_START:-}" ] || exit 1 ;;
  *pg_dump*) [ -z "\${FAIL_PG:-}" ] || exit 1; printf 'PGDUMP' ;;
  *"--entrypoint tar worker"*) printf 'TARBYTES' ;;
esac
`;

const CURL_STUB = `#!/usr/bin/env bash
printf 'curl %s\\n' "$*" >>"$CALLS"
out=""
args=("$@")
for i in "\${!args[@]}"; do
  if [ "\${args[$i]}" = "-o" ]; then out="\${args[$((i + 1))]}"; fi
done
case "$*" in
  *"-X POST"*) printf '{"result":{"name":"snap-1.snapshot","size":1}}' ;;
  *"-X DELETE"*) printf '{"result":true}' ;;
  *"/snapshots/"*) [ -z "\${FAIL_DOWNLOAD:-}" ] || exit 22; printf 'SNAPSHOT' >"$out" ;;
  *"/collections") printf '{"result":{"collections":[{"name":"org-a"},{"name":"org-b"}]}}' ;;
esac
`;

function run(
  args: string[] = [],
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    'bash',
    [join(checkout, 'infra/appliance/backup.sh'), '--dir', target, ...args],
    {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        CALLS: calls,
        RUNNING: 'postgres qdrant redis web api worker',
        RAGEN_BACKUP_RETRY_SECONDS: '0',
        ...env,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const callLog = (): string[] =>
  existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [];

const sets = (): string[] =>
  readdirSync(target)
    .filter((name) => !name.startsWith('.'))
    .sort();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ragen-backup-'));
  checkout = join(root, 'checkout');
  bin = join(root, 'bin');
  target = join(root, 'backups');
  calls = join(root, 'calls.log');
  mkdirSync(join(checkout, 'infra/appliance'), { recursive: true });
  mkdirSync(bin);
  cpSync(SCRIPT, join(checkout, 'infra/appliance/backup.sh'));
  writeFileSync(join(checkout, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(checkout, '.env.local'), 'STORAGE_PROVIDER=local\n');
  writeFileSync(join(checkout, '.env'), 'RAGEN_VERSION=1.2.3\n');
  delete process.env.STORAGE_PROVIDER;
  for (const [name, body] of [
    ['docker', DOCKER_STUB],
    ['curl', CURL_STUB],
  ] as const) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('infra/appliance/backup.sh', () => {
  it('writes one complete set: dump, a snapshot per collection, documents, configuration', () => {
    const result = run();

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const [set] = sets();
    expect(set).toMatch(/^\d{8}-\d{4}$/);
    const dir = join(target, set);
    expect(readFileSync(join(dir, 'postgres.dump'), 'utf8')).toBe('PGDUMP');
    expect(readdirSync(join(dir, 'qdrant')).sort()).toEqual([
      'org-a.snapshot',
      'org-b.snapshot',
    ]);
    expect(readFileSync(join(dir, 'storage.tar'), 'utf8')).toBe('TARBYTES');
    expect(readFileSync(join(dir, '.env.local'), 'utf8')).toContain(
      'STORAGE_PROVIDER=local',
    );
    expect(readFileSync(join(dir, 'MANIFEST'), 'utf8')).toContain(
      'ragen_version=1.2.3',
    );
    // The checksums are the set's own, and they hold.
    execFileSync('sha256sum', ['-c', '--quiet', 'SHA256SUMS'], { cwd: dir });
  });

  it('stops only the writers that were running, and starts exactly those again', () => {
    // No admin container on this machine: `docker compose start admin` on a
    // service that was never created fails the whole command.
    run();

    const log = callLog();
    expect(log).toContain('docker compose stop web api worker');
    expect(log).toContain('docker compose start web api worker');
    expect(log.indexOf('docker compose stop web api worker')).toBeLessThan(
      log.findIndex((line) => line.includes('pg_dump')),
    );
  });

  it('deletes each snapshot from Qdrant once it is downloaded', () => {
    run();

    const deletes = callLog().filter((line) => line.includes('-X DELETE'));
    expect(deletes).toHaveLength(2);
    expect(deletes[0]).toContain(
      '/collections/org-a/snapshots/snap-1.snapshot',
    );
  });

  it('sends the Qdrant API key when the install has one', () => {
    writeFileSync(
      join(checkout, '.env.local'),
      'STORAGE_PROVIDER=local\nQDRANT_API_KEY="k-123"\n',
    );

    run();

    const curls = callLog().filter((line) => line.startsWith('curl'));
    expect(curls.length).toBeGreaterThan(0);
    expect(curls.every((line) => line.includes('-H api-key: k-123'))).toBe(
      true,
    );
  });

  it('restarts the writers and leaves no complete set when a step fails', () => {
    const result = run([], { FAIL_PG: '1' });

    expect(result.status).not.toBe(0);
    expect(callLog()).toContain('docker compose start web api worker');
    // Only the .partial directory: nothing a restore could mistake for a set.
    expect(sets().every((name) => name.endsWith('.partial'))).toBe(true);
    expect(result.stderr).toContain('NIE powstał');
  });

  it('refuses S3 storage before stopping anything, unless told the documents are backed up elsewhere', () => {
    writeFileSync(join(checkout, '.env'), 'STORAGE_PROVIDER=s3\n');

    const refused = run();
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('--storage-elsewhere');
    expect(callLog()).toEqual([]);

    const accepted = run(['--storage-elsewhere']);
    expect(accepted.status).toBe(0);
    const dir = join(target, sets()[0]);
    expect(existsSync(join(dir, 'storage.tar'))).toBe(false);
    expect(readFileSync(join(dir, 'MANIFEST'), 'utf8')).toContain(
      'storage=not included (s3)',
    );
  });

  // docker-compose.fullapp.yml sets `STORAGE_PROVIDER: \${STORAGE_PROVIDER:-local}`
  // in `environment:`, filled from the shell and `.env` and winning over
  // `.env.local`. The containers are on S3 here whatever `.env.local` says.
  it('reads the storage provider where Compose does: the shell, then .env', () => {
    writeFileSync(join(checkout, '.env.local'), 'STORAGE_PROVIDER=local\n');
    writeFileSync(join(checkout, '.env'), 'STORAGE_PROVIDER=s3\n');
    expect(run().status).not.toBe(0);
    expect(callLog()).toEqual([]);

    writeFileSync(join(checkout, '.env'), 'RAGEN_VERSION=1.2.3\n');
    expect(run([], { STORAGE_PROVIDER: 's3' }).status).not.toBe(0);
    expect(callLog()).toEqual([]);
  });

  it('deletes the snapshot from Qdrant when its download fails', () => {
    const result = run([], { FAIL_DOWNLOAD: '1' });

    expect(result.status).not.toBe(0);
    const deletes = callLog().filter((line) => line.includes('-X DELETE'));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain(
      '/collections/org-a/snapshots/snap-1.snapshot',
    );
    expect(callLog()).toContain('docker compose start web api worker');
  });

  // The timer must not report a good night with the apps down.
  it('fails, after retrying, when the writers cannot be started again', () => {
    const result = run([], { FAIL_START: '1' });

    expect(result.status).not.toBe(0);
    expect(
      callLog().filter(
        (line) => line === 'docker compose start web api worker',
      ),
    ).toHaveLength(3);
    expect(result.stderr).toContain('aplikacje stoją');
    // The set itself is complete, and is not called a failed backup.
    expect(sets()[0]).toMatch(/^\d{8}-\d{4}$/);
    expect(result.stderr).not.toContain('NIE powstał');
  });

  it('refuses a second run for the same install, whatever its target', () => {
    const held = spawnSync(
      'bash',
      [
        '-c',
        'exec 8<"$1"; flock -n 8 || exit 3; bash "$1/infra/appliance/backup.sh" --dir "$2"',
        'lock',
        checkout,
        join(root, 'another-target'),
      ],
      {
        encoding: 'utf8',
        env: { PATH: `${bin}:${process.env.PATH}`, CALLS: calls, RUNNING: '' },
      },
    );

    expect(held.status).not.toBe(0);
    expect(held.status).not.toBe(3);
    expect(held.stderr).toContain('już trwa');
    expect(callLog()).toEqual([]);
  });

  it('refuses when Postgres is not running, having stopped nothing', () => {
    const result = run([], { RUNNING: 'qdrant web' });

    expect(result.status).not.toBe(0);
    expect(callLog().some((line) => line.includes('compose stop'))).toBe(false);
  });

  it('keeps the newest sets and deletes nothing that is not a set', () => {
    mkdirSync(target, { recursive: true });
    for (const name of [
      '20200101-0100',
      '20200102-0100',
      '20200103-0100',
      '20200104-0100.partial',
      'notes',
    ]) {
      mkdirSync(join(target, name));
    }

    const result = run(['--keep', '2']);

    expect(result.status).toBe(0);
    const left = sets();
    expect(left).toContain('20200103-0100');
    expect(left).not.toContain('20200101-0100');
    expect(left).not.toContain('20200102-0100');
    expect(left).toContain('20200104-0100.partial');
    expect(left).toContain('notes');
    expect(left).toHaveLength(4);
  });

  it('keeps every set with --keep 0', () => {
    mkdirSync(join(target, '20200101-0100'), { recursive: true });

    run(['--keep', '0']);

    expect(sets()).toContain('20200101-0100');
  });

  it.each(['-1', 'seven', ''])('refuses --keep %j', (keep) => {
    const result = run(['--keep', keep]);

    expect(result.status).not.toBe(0);
    expect(callLog()).toEqual([]);
  });
});
