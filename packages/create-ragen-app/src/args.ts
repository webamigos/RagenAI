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
  const positional = argv.find((arg) => !arg.startsWith('--'));

  const hasFlag = (name: string): boolean => argv.includes(`--${name}`);

  const valueOf = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  };

  return {
    targetDir: positional,
    ref: valueOf('ref') ?? DEFAULT_REF,
    skipDocker: hasFlag('skip-docker'),
    skipInstall: hasFlag('skip-install'),
    yes: hasFlag('yes'),
  };
}
