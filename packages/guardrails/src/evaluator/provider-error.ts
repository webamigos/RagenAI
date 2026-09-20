/**
 * A provider error, reduced to the parts that cannot carry the prompt.
 *
 * Guardrails call two kinds of provider — a moderation endpoint and a judge
 * model — and both are called with the customer's message. When one of those
 * calls fails, the error object it throws is **not** a safe thing to log.
 *
 * Measured, not assumed. The AI SDK's `APICallError` carries
 * `requestBodyValues`: the entire request body, which for a judge is the
 * system prompt plus the user's message. Pino's default `err` serializer
 * copies every enumerable own property of an error, so
 * `logger.warn({ err }, '…')` puts that body in the log — and the Nest logger
 * does the same when an error is passed as a parameter. Both were verified by
 * constructing a real `APICallError` and reading what came out the other end.
 *
 * That is the one thing this feature promises it does not do. `security_events`
 * deliberately carries a match *count* and never the matched text, the judge is
 * deliberately not asked for a prose `reason`, and thread content is encrypted
 * per organization (ADR-06) — and then an unhandled provider error wrote the
 * message to the log in plain text, through the error path, where nobody
 * looks until something is already wrong.
 *
 * So nothing here returns a message, a stack or a cause. A stack's first line
 * is `Name: message`, and a provider's message is the provider's to choose —
 * some echo the request back. What is left is enough to tell the failures
 * apart, which is what an operator actually needs: 401 is credentials, 429 is
 * a rate limit, 400 is a bad request, and a timeout is our own.
 */

/** What may be said about a failed provider call. */
export type ProviderErrorDescription = {
  /** The error's class, as an identifier — never free text. */
  readonly type: string;
  /** The provider's HTTP status, when it gave one. */
  readonly statusCode?: number;
  /** The provider's own short error code, when it gave one. */
  readonly code?: string;
};

/**
 * Our own timeout, as a class rather than a message.
 *
 * `new Error('judge timed out')` is indistinguishable from any other `Error`
 * once the message is dropped, and the message is exactly what must be
 * dropped. A class survives the reduction — `type` reads `JudgeTimeoutError`
 * — so the one failure that is *not* the provider's fault stays legible.
 */
export class JudgeTimeoutError extends Error {
  constructor(message = 'judge timed out') {
    super(message);
    this.name = 'JudgeTimeoutError';
  }
}

/**
 * An identifier, or nothing.
 *
 * `err.name` is writable, and a provider that set it to a sentence would put
 * that sentence straight back into the log this function exists to keep clean.
 * The charset and the length are the check; there is no sanitising, because a
 * value that needs sanitising is a value not worth keeping.
 */
function asIdentifier(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return new RegExp(`^[A-Za-z0-9_.:-]{1,${maxLength}}$`).test(value)
    ? value
    : undefined;
}

function asStatusCode(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

/** Reduce any thrown value to something safe to log. */
export function describeProviderError(err: unknown): ProviderErrorDescription {
  if (typeof err !== 'object' || err === null) {
    return { type: typeof err };
  }

  const candidate = err as Record<string, unknown>;

  const type =
    asIdentifier(candidate.name, 60) ??
    asIdentifier(candidate.constructor?.name, 60) ??
    'Error';

  // `statusCode` is the AI SDK's spelling, `status` the OpenAI SDK's. Both,
  // because guardrails call both.
  const statusCode =
    asStatusCode(candidate.statusCode) ?? asStatusCode(candidate.status);
  const code = asIdentifier(candidate.code, 40);

  return {
    type,
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(code === undefined ? {} : { code }),
  };
}

/**
 * The same thing as one short string, for the places that carry a `reason`.
 *
 * A guardrail's `reason` reaches a log and, through `onJudgeError`, an
 * operator. It used to be `err.message.slice(0, 120)`, which bounded the leak
 * rather than closing it: 120 characters of a provider's message is still 120
 * characters of whatever that provider chose to echo.
 */
export function providerErrorReason(err: unknown): string {
  const described = describeProviderError(err);
  return [described.type, described.statusCode, described.code]
    .filter((part) => part !== undefined)
    .join(':');
}
