import { createTranslator } from 'next-intl';

import en from '../../messages/en.json';
import type { EmailTranslator } from './email-translator';

/**
 * The translator a template's `PreviewProps` render with in `npm run
 * emails:dev`. The preview server renders a template synchronously from static
 * props, so it cannot await `getEmailTranslator`; this builds the same
 * translator from the English messages directly. Never used to send mail.
 */
export const previewTranslator = (namespace: string): EmailTranslator =>
  createTranslator({
    locale: 'en',
    messages: en,
    namespace: `emails.${namespace}` as never,
  }) as unknown as EmailTranslator;
