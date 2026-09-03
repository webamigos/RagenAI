/**
 * This app's binding of the shared retry wrapper (ADR-34).
 */
import { Logger } from '@nestjs/common';
import { createRetry, type LiteLLMLogger } from '@ragenai/litellm-client';

const nestLogger = new Logger('LiteLLMRetry');

const logger: LiteLLMLogger = {
  warn: (context, message) => nestLogger.warn(message, context),
  error: (context, message) => nestLogger.error(message, context),
};

export const withLiteLLMRetry = createRetry(logger);
