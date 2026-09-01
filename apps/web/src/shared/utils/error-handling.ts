import { logger } from '@/app/lib/utils/logger';
import type { OperationResult } from '@/types/common';

export function handleCommandError<T = void>(
  error: unknown,
  fallbackMessage: string
): OperationResult<T> {
  const message = error instanceof Error ? error.message : fallbackMessage;

  logger.error({ err: error }, fallbackMessage);

  return { success: false, error: message };
}
