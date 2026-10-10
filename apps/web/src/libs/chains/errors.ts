import type { ChainErrorCode } from './types/errors';

export class ChainError extends Error {
  constructor(
    message: string,
    public code: ChainErrorCode,
    public originalErrorMessage?: string,
  ) {
    super(message);
    this.name = 'ChainError';
  }
}

export class ModerationError extends ChainError {
  constructor(message = 'Content was flagged by moderation') {
    super(message, 'moderation-error');
  }
}

/**
 * A guardrail refused the turn.
 *
 * Carries the rule so the caller can record an event without re-deriving which
 * rule fired, and *not* the matched text: that is the customer's message, and
 * an error object is exactly the kind of thing that ends up in a log.
 */
export class GuardrailError extends ChainError {
  constructor(
    public guardrailPublicId: string,
    public guardrailName: string,
    message = 'Input was refused by a guardrail',
  ) {
    super(message, 'guardrail-blocked');
    this.name = 'GuardrailError';
  }
}

export class ApiKeyError extends ChainError {
  constructor(message = 'API Key not found') {
    super(message, 'api-key-error');
  }
}

export class UnknownChainError extends ChainError {
  constructor(message = 'An unexpected chain error occurred') {
    super(message, 'unknown-error');
  }
}

export class LLMApiError extends ChainError {
  constructor(
    message = 'LLM API request failed',
    originalErrorMessage?: string,
  ) {
    super(message, 'llm-api-error', originalErrorMessage);
  }
}

/**
 * The model chosen for a turn cannot be called on this deployment.
 *
 * `originalErrorMessage` carries the gateway's own sentence — the model, the
 * provider and the *names* of the variables it needs, never their values — and
 * the client appends it to the translated text, so whoever reads it can tell an
 * administrator exactly what to set.
 */
export class ModelNotConfiguredError extends ChainError {
  constructor(
    public readonly modelId: string,
    detail: string,
  ) {
    super(
      `Model "${modelId}" is not configured on this deployment`,
      'model-not-configured',
      `${modelId}: ${detail}`,
    );
    this.name = 'ModelNotConfiguredError';
  }
}
