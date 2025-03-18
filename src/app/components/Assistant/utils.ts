import { type TranslationFn } from './types';
import { SseMessageError } from '@/app/contracts/Events';

export function getErrorMessage(
  event: SseMessageError,
  t: TranslationFn
): string | null {
  if (!event.code) {
    return null;
  }

  if (event.originalErrorMessage) {
    return t(event.code) + ` - ${event.originalErrorMessage}`;
  }
  return t(event.code);
}
