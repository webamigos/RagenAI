export interface CliArgs {
  /** Undefined when nothing but global flags was given — the CLI shows help. */
  command: string | undefined;
  /**
   * Everything after the command, verbatim and in order, including flags.
   * `ragen create ./app --skip-docker` has to hand `--skip-docker` to
   * create-ragen-app unchanged; parsing it here would mean re-implementing
   * another package's argument surface and going stale the moment it grows.
   */
  rest: string[];
  /** `-h` / `--help` given *before* any command. */
  help: boolean;
  /** `-v` / `--version` given *before* any command. */
  version: boolean;
}

const HELP_FLAGS = new Set(['-h', '--help']);
const VERSION_FLAGS = new Set(['-v', '--version']);

/**
 * Splits at the first positional argument: flags before it are this CLI's,
 * everything from it onward belongs to the command.
 *
 * That boundary is the whole design. Without it `ragen create ./app --help`
 * is ambiguous — and the useful reading is create-ragen-app's help, not ours.
 */
export function parseArgs(argv: string[]): CliArgs {
  const commandIndex = argv.findIndex((arg) => !arg.startsWith('-'));

  const globalFlags = commandIndex === -1 ? argv : argv.slice(0, commandIndex);

  return {
    command: commandIndex === -1 ? undefined : argv[commandIndex],
    rest: commandIndex === -1 ? [] : argv.slice(commandIndex + 1),
    help: globalFlags.some((arg) => HELP_FLAGS.has(arg)),
    version: globalFlags.some((arg) => VERSION_FLAGS.has(arg)),
  };
}
