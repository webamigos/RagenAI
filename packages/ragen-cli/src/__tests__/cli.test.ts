import { describe, expect, it, vi } from 'vitest';

import { run, type RunOptions } from '../cli';
import { COMMANDS } from '../commands';

function harness(overrides: Partial<RunOptions> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const create = vi.fn(() => 0);

  const options: RunOptions = {
    version: '1.2.3',
    create,
    out: (message) => out.push(message),
    err: (message) => err.push(message),
    ...overrides,
  };

  return {
    create,
    out,
    err,
    run: (argv: string[]) => run(argv, options),
  };
}

describe('run', () => {
  it('prints help and succeeds when given nothing', () => {
    const cli = harness();
    expect(cli.run([])).toBe(0);
    expect(cli.out.join('\n')).toContain('Usage');
  });

  it('prints just the version for --version', () => {
    const cli = harness();
    expect(cli.run(['--version'])).toBe(0);
    expect(cli.out).toEqual(['1.2.3']);
  });

  it('prints the version for the version command too', () => {
    const cli = harness();
    expect(cli.run(['version'])).toBe(0);
    expect(cli.out).toEqual(['1.2.3']);
  });

  it('fails on an unknown command and points at help', () => {
    const cli = harness();
    expect(cli.run(['deploy'])).toBe(1);
    expect(cli.err.join('\n')).toContain('Unknown command: deploy');
    expect(cli.out).toEqual([]);
  });

  it('delegates create, forwarding its arguments unchanged', () => {
    const cli = harness();
    expect(cli.run(['create', './app', '--skip-docker'])).toBe(0);
    expect(cli.create).toHaveBeenCalledWith(['./app', '--skip-docker']);
  });

  it("returns the scaffolder's exit code rather than its own", () => {
    const cli = harness({ create: () => 42 });
    expect(cli.run(['create'])).toBe(42);
  });

  it.each(COMMANDS.filter((command) => command.status === 'planned'))(
    'exits non-zero for the planned command $name, on stderr',
    (command) => {
      // The failure this prevents: a script running `ragen plugin install`
      // against a version that cannot do it, seeing exit 0, and carrying on.
      const cli = harness();
      expect(cli.run([command.name])).toBe(1);
      expect(cli.err.join('\n')).toContain('is not built yet');
      expect(cli.out).toEqual([]);
    },
  );

  it.each(COMMANDS.filter((command) => command.status === 'available'))(
    'has the available command $name wired up, not falling through',
    (command) => {
      const cli = harness();
      cli.run([command.name]);
      expect(cli.err.join('\n')).not.toContain('listed but not wired up');
    },
  );
});
