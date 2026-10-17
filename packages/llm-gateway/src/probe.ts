import { findRoute } from './route-table';
import type { CredentialSource, RouteTable } from './types';

/**
 * What a probe found for one model id.
 *
 * - `ok` — the upstream answered and lists the model.
 * - `unreachable` — the upstream did not answer, answered with an error, or
 *   answered with something that is not a model list.
 * - `missing` — the upstream answered, and the model is not among the ones it
 *   serves: on Ollama, a model nobody pulled.
 * - `not-probed` — no free probe exists for this route, so nothing was asked.
 */
export type ModelProbeState = 'ok' | 'unreachable' | 'missing' | 'not-probed';

export type ModelProbe = {
  readonly modelId: string;
  readonly state: ModelProbeState;
  /** The route's connection, for an `openai-compatible` route. */
  readonly connection?: string;
  /** The upstream's own name for the model — what `ollama pull` takes. */
  readonly upstreamModel?: string;
};

export type ProbeOptions = {
  readonly fetch?: typeof globalThis.fetch;
  /** Per upstream. The probe runs on the sign-in page, so it must be short. */
  readonly timeoutMs?: number;
};

/**
 * Ask each `openai-compatible` upstream which models it serves, and say for
 * every model id whether it is there.
 *
 * Only `openai-compatible`, and only `GET /models`, on purpose. That listing
 * costs nothing, and it is the one question a local server (Ollama, vLLM, TGI)
 * can be wrong about without the configuration being wrong: the container is
 * stopped, or the model was never pulled. A cloud provider has no equivalent
 * free call — proving one works means a billed completion — and its failure
 * mode is credentials, which the setup check already reads from the
 * environment. So a cloud route is `not-probed` rather than probed expensively
 * on every page load.
 *
 * One request per connection, however many model ids share it. Never throws:
 * this feeds a diagnostics screen.
 */
export async function probeModels(
  routes: RouteTable,
  credentials: CredentialSource,
  modelIds: readonly string[],
  options: ProbeOptions = {},
): Promise<ModelProbe[]> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 2000;
  const listings = new Map<string, Promise<Set<string> | null>>();

  const listingFor = (connection: string) => {
    let listing = listings.get(connection);
    if (!listing) {
      listing = listModels(credentials, connection, fetchImpl, timeoutMs);
      listings.set(connection, listing);
    }
    return listing;
  };

  const unique = [...new Set(modelIds)];
  return Promise.all(
    unique.map(async (modelId): Promise<ModelProbe> => {
      const route = findRoute(routes, modelId);
      if (route?.provider !== 'openai-compatible' || !route.connection) {
        return { modelId, state: 'not-probed' };
      }
      const served = await listingFor(route.connection);
      const base = {
        modelId,
        connection: route.connection,
        upstreamModel: route.model,
      };
      if (served === null) {
        return { ...base, state: 'unreachable' };
      }
      return { ...base, state: lists(served, route.model) ? 'ok' : 'missing' };
    }),
  );
}

/**
 * Ollama lists a model pulled without a tag as `name:latest`, and a route may
 * name it either way. Any other tag is taken as written.
 */
function lists(served: Set<string>, model: string): boolean {
  if (served.has(model)) {
    return true;
  }
  if (!model.includes(':')) {
    return served.has(`${model}:latest`);
  }
  return model.endsWith(':latest') && served.has(model.slice(0, -7));
}

async function listModels(
  credentials: CredentialSource,
  connection: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<Set<string> | null> {
  try {
    const { baseUrl, apiKey, headers } = await credentials.forProvider(
      'openai-compatible',
      { connection },
    );
    if (!baseUrl) {
      return null;
    }
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: {
        ...headers,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { data?: unknown };
    // Every entry must carry a string id. A list with one that does not is not
    // a model list, and reading the rest would report a model "missing" from
    // a response that never described the server's models at all.
    if (
      !Array.isArray(body.data) ||
      body.data.some(
        (entry) => !entry || typeof (entry as { id?: unknown }).id !== 'string',
      )
    ) {
      return null;
    }
    return new Set(body.data.map((entry) => (entry as { id: string }).id));
  } catch {
    // Missing credentials, a refused connection, a timeout, a body that is
    // not JSON: all of them mean the same thing to the operator.
    return null;
  }
}
