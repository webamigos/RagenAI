import { EnvCredentialSource } from './credentials-from-env';
import { LlmGateway } from './resolve-model';
import { routeTableFromEnv } from './route-table';

/**
 * Which path a model call takes.
 *
 * `litellm` is the default for the whole of Phase B, and that ordering is the
 * point: the gateway ships reachable but unused, so the two paths can be run
 * against the same questions on the same day. B4 flips the default in one
 * environment, then everywhere; B6 reduces this to a single value, at which
 * point the flag becomes a seam naming an endpoint rather than a choice
 * between two implementations. See Q6 in the spec.
 */
export const GATEWAY_MODES = ['litellm', 'native'] as const;

export type GatewayMode = (typeof GATEWAY_MODES)[number];

export const DEFAULT_GATEWAY_MODE: GatewayMode = 'litellm';

export class InvalidGatewayModeError extends Error {
  constructor(value: string) {
    super(
      `LLM_GATEWAY must be one of ${GATEWAY_MODES.join(', ')} — got "${value}"`,
    );
    this.name = 'InvalidGatewayModeError';
  }
}

/**
 * Read the mode, and **throw on anything unrecognised**.
 *
 * Falling back to the default on a typo is the tempting behaviour and the
 * wrong one. `LLM_GATEWAY=nativ` would then run the proxy arm while the
 * operator believed they were measuring the gateway, and the only evidence
 * would be a comparison that came out suspiciously identical — which is
 * precisely the reading Phase B's measurement has to be able to trust. An
 * unset value is a different thing from a misspelt one and keeps the default.
 */
export function gatewayModeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GatewayMode {
  const raw = env.LLM_GATEWAY?.trim();
  if (!raw) {
    return DEFAULT_GATEWAY_MODE;
  }
  const match = GATEWAY_MODES.find((mode) => mode === raw);
  if (!match) {
    throw new InvalidGatewayModeError(raw);
  }
  return match;
}

/** Whether this process should call providers directly. */
export function usingNativeGateway(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return gatewayModeFromEnv(env) === 'native';
}

let cached: LlmGateway | null = null;

/**
 * The gateway this process uses, built once.
 *
 * Lazy for the same reason every credential read in this repository is lazy: a
 * build step that imports a module must not be made to hold a route table and
 * a set of provider keys. Nothing is read until the first call, which under
 * `LLM_GATEWAY=litellm` never comes.
 */
export function gatewayFromEnv(): LlmGateway {
  if (!cached) {
    cached = new LlmGateway({
      routes: routeTableFromEnv(),
      credentials: new EnvCredentialSource(),
    });
  }
  return cached;
}

/** Drop the cached gateway. For tests, and for a future credential rotation. */
export function resetGatewayCache(): void {
  cached = null;
}
