import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

/** Injected in tests; nothing spawns a real process in a unit test. */
export type Spawn = (
  command: string,
  args: string[],
  options: { stdio: 'inherit' },
) => Pick<SpawnSyncReturns<Buffer>, 'status' | 'error'>;

export const CREATE_PACKAGE = 'create-ragen-app@latest';

/**
 * Hands scaffolding to `create-ragen-app` rather than reimplementing it.
 *
 * That package is the only thing exercising the first-run path, and CI runs it
 * on every pull request precisely because the changes that break it are mostly
 * not in its own directory. A second copy of the wizard here would be a second
 * thing to keep in step with the env manifest, and it would drift silently.
 */
export function runCreate(
  args: string[],
  spawn: Spawn = spawnSync,
  log: (message: string) => void = console.error,
): number {
  const result = spawn('npx', ['--yes', CREATE_PACKAGE, ...args], {
    stdio: 'inherit',
  });

  if (result.error) {
    // Almost always a missing or sandboxed npx. Printing the command the user
    // can run by hand is more useful than surfacing an ENOENT.
    log(
      [
        `Could not run npx (${result.error.message}).`,
        '',
        'Run the scaffolder directly:',
        `  npx ${CREATE_PACKAGE}${args.length > 0 ? ` ${args.join(' ')}` : ''}`,
      ].join('\n'),
    );
    return 1;
  }

  // A null status means the child was killed by a signal; treating that as
  // success would report a Ctrl+C as a finished install.
  return result.status ?? 1;
}
