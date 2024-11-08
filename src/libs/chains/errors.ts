import type { ChainErrorCode } from './types/errors';

export class ChainError extends Error {
  constructor(
    message: string,
    public code: ChainErrorCode,
    public originalErrorMessage?: string
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
    originalErrorMessage?: string
  ) {
    super(message, 'llm-api-error', originalErrorMessage);
  }
}
