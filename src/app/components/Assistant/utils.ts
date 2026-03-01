import { type TranslationFn } from './types';
import { type SseMessageError } from '@/features/threads/contracts/events.types';

export function getErrorMessage(
  event: SseMessageError,
  t: TranslationFn,
): string {
  if (!event.code) {
    return event.message || t('unknown-error');
  }
  if (event.originalErrorMessage) {
    return t(event.code) + ` - ${event.originalErrorMessage}`;
  }
  return t(event.code);
}
