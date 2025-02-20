import { SseMessageError } from '@/app/contracts/Events';
import { type TranslationFn, type ErrorEvent } from './types';

export function getErrorMessage(
  event: ErrorEvent,
  t: TranslationFn
): string | null {
  const defaultErrorMessage = null;

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
