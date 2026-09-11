export interface CliArgs {
  /** Undefined when the user gave no positional argument — the CLI prompts. */
  targetDir: string | undefined;
  ref: string;
  skipDocker: boolean;
  skipInstall: boolean;
  yes: boolean;
}

export const DEFAULT_TARGET_DIR = './ragen-app';
const DEFAULT_REF = 'main';

export function parseArgs(argv: string[]): CliArgs {
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  if (positionals.length > 1) {
    // Every flag here takes `--name=value`, not a separate token — a second
    // bare token (e.g. `--ref main`) would otherwise silently become
    // targetDir instead of erroring.
    throw new Error(
      `Unexpected extra arguments: ${positionals.slice(1).join(' ')}. Flag values must use --name=value.`,
    );
  }

  const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

  const valueOf = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const value = argv
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length);
    return value || undefined;
  };

  return {
    targetDir: positionals[0],
    ref: valueOf('ref') ?? DEFAULT_REF,
    skipDocker: hasFlag('skip-docker'),
    skipInstall: hasFlag('skip-install'),
    yes: hasFlag('yes'),
  };
}
