/**
 * Argument parsing for the commands that talk to an installation.
 *
 * Deliberately small: a flag either takes the next argument as its value or
 * is a switch, and everything else is positional. Each command names its own
 * value flags; `--url` and `--api-key` are everyone's, because every one of
 * them needs a connection.
 */
export type Flags = {
  values: Map<string, string>;
  switches: Set<string>;
  positional: string[];
};

export const CONNECTION_FLAGS = ['--url', '--api-key'] as const;

export function parseFlags(
  args: string[],
  valueFlags: readonly string[],
): Flags {
  const takesValue = new Set<string>([...CONNECTION_FLAGS, ...valueFlags]);
  const flags: Flags = {
    values: new Map(),
    switches: new Set(),
    positional: [],
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (takesValue.has(arg)) {
      flags.values.set(arg, args[i + 1] ?? '');
      i++;
    } else if (arg.startsWith('--')) {
      flags.switches.add(arg);
    } else {
      flags.positional.push(arg);
    }
  }
  return flags;
}

/**
 * A positive integer flag, or `undefined` when absent. A value that is present
 * but not a positive integer throws rather than falling back to a default —
 * `--limit abc` silently meaning "the default" is the kind of thing a script
 * never notices.
 */
export function positiveInt(flags: Flags, name: string): number | undefined {
  const raw = flags.values.get(name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} takes a positive whole number, not "${raw}".`);
  }
  return value;
}
