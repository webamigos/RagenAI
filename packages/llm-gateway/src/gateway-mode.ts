import { EnvCredentialSource } from './credentials-from-env';
import { LlmGateway } from './resolve-model';
import { routeTableFromEnv } from './route-table';

/**
 * Which path a model call takes.
 *
 * `native` is the default as of B4's "then everywhere" step. For the whole of
 * Phase B before it the order was the other way round — the gateway shipped
 * reachable but unused, so both paths could be run against the same questions
 * on the same day — and the evidence for flipping is that comparison
 * (`docs/rag-gateway-comparison-2026-09-15.md`: no retrieval regression, one
 * reproducible difference in answer composition) plus demo running `native`
 * and reporting it on `/api/healthcheck`.
 *
 * `litellm` remains a supported value, not a deprecated one: B6 is what
 * reduces this to a single value, at which point the flag becomes a seam
 * naming an endpoint rather than a choice between two implementations. Until
 * then, setting it back is the rollback the runbook documents. See Q6 in the
 * spec.
 *
 * **What this default changes for an existing deployment**: one that never set
 * `LLM_GATEWAY` moves from the proxy to direct provider calls on its next
 * deploy, and the provider credentials must therefore be present in the web,
 * api and worker processes rather than only in the proxy container. That is
 * the operational consequence Q1 accepted, and
 * `npm run gateway:preflight -- --probe` is how it is checked before a deploy
 * rather than discovered after one.
 */
export const GATEWAY_MODES = ['litellm', 'native'] as const;

export type GatewayMode = (typeof GATEWAY_MODES)[number];

export const DEFAULT_GATEWAY_MODE: GatewayMode = 'native';

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
 * a set of provider keys. Nothing is read until the first call — which under
 * `LLM_GATEWAY=litellm` never comes, and which under the new default comes on
 * the first model call rather than at import.
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
