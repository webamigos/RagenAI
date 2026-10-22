import {
  findApplianceProfile,
  findApplianceTier,
  APPLIANCE_PROFILES,
  APPLIANCE_TIERS,
  DEFAULT_APPLIANCE_PROFILE,
  type ApplianceProfileId,
} from './appliance';
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
  /**
   * Set by `--appliance` (the local profile) or `--appliance=<profile>`:
   * models served on this machine instead of a cloud provider, so no key is
   * asked for. Undefined when the CLI should ask.
   */
  appliance: ApplianceProfileId | undefined;
  /** `--tier=`; only meaningful with `--appliance`. Undefined = the default. */
  tier: string | undefined;
  /** `--gpu`: add the NVIDIA reservation to an appliance's model server. */
  gpu: boolean;
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

  const appliance = parseAppliance(
    hasFlag('appliance'),
    argv.some((arg) => arg.startsWith('--appliance=')),
    valueOf('appliance'),
  );
  if (appliance && provider) {
    // Two answers to one question. Picking either silently would scaffold an
    // install the caller did not ask for — a cloud one, in the worse case.
    throw new Error(
      '--appliance serves models on this machine and takes no provider key; drop --provider.',
    );
  }

  const tier = valueOf('tier');
  if (tier && !appliance) {
    throw new Error('--tier only applies to an appliance; add --appliance.');
  }
  if (tier && !findApplianceTier(tier)) {
    throw new Error(
      `Unknown --tier=${tier}. Expected one of: ${APPLIANCE_TIERS.map((t) => t.id).join(', ')}.`,
    );
  }
  if (hasFlag('gpu') && !appliance) {
    throw new Error('--gpu only applies to an appliance; add --appliance.');
  }

  return {
    targetDir: positionals[0],
    ref: valueOf('ref') ?? DEFAULT_REF,
    skipDocker: hasFlag('skip-docker'),
    skipInstall: hasFlag('skip-install'),
    yes: hasFlag('yes'),
    provider: provider as LlmProviderChoice | undefined,
    appliance,
    tier,
    gpu: hasFlag('gpu'),
  };
}

/**
 * `--appliance` alone is the local profile; `--appliance=<profile>` names
 * one. A profile that exists and is not available yet (hybrid) is refused
 * with the reason, rather than quietly installed as local: a hybrid install
 * that sends nothing out is a surprise of the harmless kind, but the next
 * profile added may not be.
 */
function parseAppliance(
  bare: boolean,
  withEquals: boolean,
  value: string | undefined,
): ApplianceProfileId | undefined {
  // `--appliance=` with nothing after it is usually `--appliance=$PROFILE`
  // with the variable unset. Reading it as "no flag" would scaffold a cloud
  // install for a caller who asked for one that sends nothing out.
  if (withEquals && value === undefined) {
    throw new Error(
      `--appliance= needs a profile. Expected one of: ${APPLIANCE_PROFILES.map((p) => p.id).join(', ')}, or a bare --appliance.`,
    );
  }
  if (!bare && !withEquals) {
    return undefined;
  }
  const id = value ?? DEFAULT_APPLIANCE_PROFILE;
  const profile = findApplianceProfile(id);
  if (!profile) {
    throw new Error(
      `Unknown --appliance=${id}. Expected one of: ${APPLIANCE_PROFILES.map((p) => p.id).join(', ')}.`,
    );
  }
  if (!profile.available) {
    throw new Error(
      `--appliance=${id} is not available yet: ${profile.unavailableReason}.`,
    );
  }
  return profile.id;
}
