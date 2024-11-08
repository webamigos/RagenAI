import { SseMessageError } from '@/app/contracts/Events';
import type { ErrorEvent } from './types';

export function getErrorMessage(
  event: ErrorEvent,
  t: (key: string, values?: Record<string, any>) => string
): string {
  const defaultErrorMessage = t('unknown-error');

  if (!event.data) {
    return defaultErrorMessage;
  }

  try {
    const { code, originalErrorMessage } = JSON.parse(
      event.data
    ) as SseMessageError;

    if (originalErrorMessage) {
      return t(code) + ` - ${originalErrorMessage}`;
    }
    return t(code);
  } catch {
    return defaultErrorMessage;
  }
}
