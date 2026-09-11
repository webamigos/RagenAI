import type { LlmProviderChoice } from './llm-provider';

export interface CliArgs {
  /** Undefined when the user gave no positional argument — the CLI prompts. */
  targetDir: string | undefined;
  ref: string;
  skipDocker: boolean;
  skipInstall: boolean;
  yes: boolean;
  /**
   * Undefined when the CLI should ask. Set by `--provider=`, which takes the
   * API key from the environment instead of a prompt — for anyone who would
   * rather not put a provider key in their shell history, and for CI, which
   * has no way to answer a prompt at all.
   */
  provider: LlmProviderChoice | undefined;
}

export const DEFAULT_TARGET_DIR = './ragen-app';
const DEFAULT_REF = 'main';

const PROVIDERS: LlmProviderChoice[] = ['openai', 'anthropic'];

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

  const provider = valueOf('provider');
  if (provider && !PROVIDERS.includes(provider as LlmProviderChoice)) {
    // Rejected rather than ignored: silently falling back to "ask me" turns a
    // typo in a CI job into a hang on a prompt nothing can answer.
    throw new Error(
      `Unknown --provider=${provider}. Expected one of: ${PROVIDERS.join(', ')}.`,
    );
  }

  return {
    targetDir: positionals[0],
    ref: valueOf('ref') ?? DEFAULT_REF,
    skipDocker: hasFlag('skip-docker'),
    skipInstall: hasFlag('skip-install'),
    yes: hasFlag('yes'),
    provider: provider as LlmProviderChoice | undefined,
  };
}
