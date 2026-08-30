import { Logger } from '@nestjs/common';

/**
 * Ported from ragen-app's src/types/common.ts (`OperationResult<T>`) and
 * src/shared/utils/error-handling.ts (`handleCommandError`). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const logger = new Logger('MessagesService');

export function handleCommandError<T = void>(
  error: unknown,
  fallbackMessage: string,
): OperationResult<T> {
  const message = error instanceof Error ? error.message : fallbackMessage;
  logger.error(fallbackMessage, error);
  return { success: false, error: message };
}
