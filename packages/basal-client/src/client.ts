import type {
  BasalAnswer,
  DecideRequest,
  DecideResponse,
  DecideResult,
  UnavailableReason,
} from './types';

/**
 * After this many consecutive failures the client stops calling basal for
 * `BREAKER_OPEN_MS`. Without it, a basal that is down costs every turn the
 * full timeout before the caller falls back — the spec's "at worst five slow
 * turns per replica" is this number.
 */
export const BREAKER_FAILURE_THRESHOLD = 5;
export const BREAKER_OPEN_MS = 60_000;

/**
 * How long the served model read from `GET /v1/models` is trusted.
 *
 * A calibrated threshold is valid for one model on one engine port, so a
 * caller compares the served model with the one its threshold was measured
 * on. Read off the turn path and cached, so a swap made while running is
 * noticed within this window without costing a request per turn.
 */
export const SERVED_MODEL_TTL_MS = 5 * 60_000;

/** How long a `GET /v1/models` may take. It is off the turn path. */
export const SERVED_MODEL_TIMEOUT_MS = 2_000;

/**
 * Which weights answer, and through which engine.
 *
 * Both halves, because the name alone does not identify a calibration: the
 * same GGUF folder is `basal-2.0-4.5B-GGUF` under Ollama and under llama.cpp,
 * and each port ships its own `CALIBRATION.<engine>.json` with different
 * thresholds (measured 2026-10-14: `choice` at the 5% target is 0.977 under
 * MLX and 0.939 under Ollama for the same 4.5B model).
 */
export type ServedModel = {
  readonly name: string;
  /** `mlx`, `ollama`, `fast`, … — `null` when the server does not say. */
  readonly mode: string | null;
};

/**
 * What the client reports. A caller passes whatever logger it has; the client
 * depends on none, the way `@ragenai/vault-client` does not.
 *
 * Never handed the request's text: the state is customer text, and the
 * breaker's message says which server failed, not what it was asked.
 */
export type BasalClientLogger = {
  warn: (meta: Record<string, unknown>, message: string) => void;
};

const SILENT_LOGGER: BasalClientLogger = { warn: () => {} };

export type BasalClientOptions = {
  /** The server's base URL, e.g. `http://basal:8000`. */
  readonly url: string;
  /**
   * Sent as a bearer token when set. basal-serve has no authentication of its
   * own; this is for a reverse proxy an operator puts in front of it.
   */
  readonly apiKey?: string;
  readonly logger?: BasalClientLogger;
  /** Injected in tests. */
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
};

export type BasalClient = {
  /**
   * Ask basal. Resolves within `timeoutMs` and never rejects.
   *
   * The timeout is the caller's, not a client default, because it is a
   * decision about the caller's latency budget: the guardrail first pass owns
   * its own constant in `@ragenai/guardrails`, so both runtimes wait the same.
   */
  decide: (request: DecideRequest, timeoutMs: number) => Promise<DecideResult>;
  /** The served model, or `null` when it cannot be read. Cached. */
  servedModel: () => Promise<ServedModel | null>;
};

export function createBasalClient(options: BasalClientOptions): BasalClient {
  const baseUrl = options.url.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? SILENT_LOGGER;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.apiKey) {
    headers.authorization = `Bearer ${options.apiKey}`;
  }

  let consecutiveFailures = 0;
  let openUntil = 0;
  let cachedModel: { model: ServedModel | null; readAt: number } | null = null;

  const breakerOpen = (): boolean => now() < openUntil;

  const succeeded = (): void => {
    consecutiveFailures = 0;
  };

  const failed = (reason: UnavailableReason): void => {
    consecutiveFailures += 1;
    if (consecutiveFailures >= BREAKER_FAILURE_THRESHOLD && !breakerOpen()) {
      openUntil = now() + BREAKER_OPEN_MS;
      consecutiveFailures = 0;
      // Once per trip, not once per failure: a basal that is down for an hour
      // would otherwise log every turn.
      logger.warn(
        { url: baseUrl, reason, openForMs: BREAKER_OPEN_MS },
        'basal unavailable; skipping it until the breaker closes',
      );
    }
  };

  async function request(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<{ ok: true; body: unknown } | { ok: false; reason: UnavailableReason }> {
    try {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        return { ok: false, reason: 'http' };
      }
      try {
        return { ok: true, body: await response.json() };
      } catch {
        return { ok: false, reason: 'malformed' };
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      return {
        ok: false,
        reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
      };
    }
  }

  return {
    async decide(decideRequest, timeoutMs) {
      if (breakerOpen()) {
        return { outcome: 'unavailable', reason: 'breaker-open' };
      }
      const result = await request(
        '/v1/systemone',
        { method: 'POST', headers, body: JSON.stringify(decideRequest) },
        timeoutMs,
      );
      if (!result.ok) {
        failed(result.reason);
        return { outcome: 'unavailable', reason: result.reason };
      }
      const response = parseDecideResponse(result.body, decideRequest);
      if (!response) {
        failed('malformed');
        return { outcome: 'unavailable', reason: 'malformed' };
      }
      succeeded();
      return { outcome: 'answered', response };
    },

    async servedModel() {
      if (cachedModel && now() - cachedModel.readAt < SERVED_MODEL_TTL_MS) {
        return cachedModel.model;
      }
      if (breakerOpen()) {
        return null;
      }
      const result = await request(
        '/v1/models',
        { method: 'GET', headers },
        SERVED_MODEL_TIMEOUT_MS,
      );
      const model = result.ok ? readServedModel(result.body) : null;
      if (model === null) {
        // A failed read counts toward the breaker, as the spec says: a server
        // that cannot name its model is not one to trust with a decision.
        failed(result.ok ? 'malformed' : result.reason);
      } else {
        succeeded();
      }
      cachedModel = { model, readAt: now() };
      return model;
    },
  };
}

const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The response, or `null` when it is not one a caller can act on.
 *
 * Strict on purpose. A caller compares these numbers with a threshold to
 * decide whether a guardrail is skipped, so an answer missing for a question,
 * of the wrong type, or with a probability outside [0, 1] must read as "no
 * answer" — never as a low score.
 */
export function parseDecideResponse(
  body: unknown,
  request: DecideRequest,
): DecideResponse | null {
  if (!isRecord(body) || typeof body.model !== 'string' || !isRecord(body.answers)) {
    return null;
  }
  const answers: Record<string, BasalAnswer> = {};
  for (const [name, question] of Object.entries(request.questions)) {
    const answer = body.answers[name];
    if (!isRecord(answer) || answer.type !== question.type) {
      return null;
    }
    if (!isRecord(answer.probabilities) || !isProbability(answer.confidence)) {
      return null;
    }
    const probabilities = answer.probabilities;
    if (question.type === 'choice') {
      const keys = Object.keys(question.criteria);
      if (
        typeof answer.choice !== 'string' ||
        !keys.includes(answer.choice) ||
        !keys.every((key) => isProbability(probabilities[key]))
      ) {
        return null;
      }
      answers[name] = {
        type: 'choice',
        choice: answer.choice,
        probabilities: Object.fromEntries(keys.map((key) => [key, probabilities[key] as number])),
        confidence: answer.confidence,
      };
    } else {
      if (
        !isProbability(answer.noul) ||
        !isProbability(probabilities.true) ||
        !isProbability(probabilities.false)
      ) {
        return null;
      }
      answers[name] = {
        type: 'noul',
        noul: answer.noul,
        probabilities: { true: probabilities.true, false: probabilities.false },
        confidence: answer.confidence,
      };
    }
  }
  return {
    model: body.model,
    answers,
    ...(isRecord(body.usage) ? { usage: body.usage as DecideResponse['usage'] } : {}),
  };
}

function readServedModel(body: unknown): ServedModel | null {
  if (!isRecord(body) || !Array.isArray(body.models)) {
    return null;
  }
  const first: unknown = body.models[0];
  if (!isRecord(first) || typeof first.name !== 'string' || first.name === '') {
    return null;
  }
  return {
    name: first.name,
    mode: typeof first.mode === 'string' && first.mode !== '' ? first.mode : null,
  };
}
