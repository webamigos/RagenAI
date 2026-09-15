import { EnvCredentialSource } from './credentials-from-env';
import { LlmGateway } from './resolve-model';
import { routeTableFromEnv } from './route-table';

/**
 * The gateway this process uses.
 *
 * There used to be a choice here — `LLM_GATEWAY=litellm|native` — and B6
 * removed it along with the proxy. A flag with one value is a field kept for
 * its own sake, so it went rather than being left reporting a constant; the
 * routing decisions it used to gate now live where they belong, in the route
 * table.
 */
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
