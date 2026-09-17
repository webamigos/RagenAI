import { COMMANDS, type CommandSpec } from './commands';

const INDENT = '  ';

function column(commands: readonly CommandSpec[]): number {
  return Math.max(...commands.map((command) => command.name.length));
}

function list(commands: readonly CommandSpec[], width: number): string[] {
  return commands.map(
    (command) =>
      `${INDENT}${command.name.padEnd(width)}${INDENT}${command.summary}`,
  );
}

export function helpText(version: string): string {
  const available = COMMANDS.filter((c) => c.status === 'available');
  const planned = COMMANDS.filter((c) => c.status === 'planned');
  const width = column(COMMANDS);

  return [
    `ragen ${version} — command line for Ragen AI`,
    '',
    'Usage',
    `${INDENT}ragen <command> [options]`,
    '',
    'Commands',
    ...list(available, width),
    '',
    // Listed, not hidden: see the note in commands.ts.
    'Not built yet',
    ...list(planned, width),
    '',
    'Options',
    `${INDENT}-h, --help${INDENT}   show this message`,
    `${INDENT}-v, --version${INDENT}print the version`,
    '',
    'Docs: https://docs.ragen.ai',
  ].join('\n');
}

export function notBuiltYet(command: CommandSpec): string {
  return [
    `\`ragen ${command.name}\` is not built yet.`,
    '',
    `It is waiting on ${command.blockedBy ?? 'work that has not started'}.`,
    'Exiting non-zero so a script does not read this as success.',
  ].join('\n');
}
