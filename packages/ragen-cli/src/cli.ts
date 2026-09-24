import { parseArgs } from './args';
import { findCommand } from './commands';
import { helpText, notBuiltYet } from './help';

export interface RunOptions {
  version: string;
  /** Injected so the router is testable without spawning anything. */
  create: (args: string[]) => number;
  /** `ragen brain …`, which talks to the API and so is asynchronous. */
  brain: (args: string[]) => Promise<number>;
  /**
   * Required, not defaulted to `console`: the router does no I/O of its own,
   * which is what lets a test read its output instead of capturing a stream.
   * index.ts is the one place that knows about the process.
   */
  out: (message: string) => void;
  err: (message: string) => void;
}

/**
 * Routes one invocation and returns its exit code. Pure apart from the two
 * writers and `create`, all of which are injected — the process-level concerns
 * (reading the version, setting an exit code, catching a throw) live in
 * index.ts and nowhere else.
 */
export function run(
  argv: string[],
  options: RunOptions,
): number | Promise<number> {
  const { out, err } = options;

  const args = parseArgs(argv);

  if (args.version && !args.command) {
    out(options.version);
    return 0;
  }

  if (!args.command || args.help) {
    out(helpText(options.version));
    return 0;
  }

  const command = findCommand(args.command);

  if (!command) {
    err(
      [
        `Unknown command: ${args.command}`,
        '',
        'Run `ragen help` to see what this CLI can do.',
      ].join('\n'),
    );
    return 1;
  }

  if (command.status === 'planned') {
    err(notBuiltYet(command));
    return 1;
  }

  switch (command.name) {
    case 'create':
      return options.create(args.rest);
    case 'brain':
      return options.brain(args.rest);
    case 'help':
      out(helpText(options.version));
      return 0;
    case 'version':
      out(options.version);
      return 0;
    default:
      // Unreachable while commands.ts and this switch agree; the test suite
      // asserts they do, and this keeps the failure loud rather than silent.
      err(`Command ${command.name} is listed but not wired up.`);
      return 1;
  }
}
