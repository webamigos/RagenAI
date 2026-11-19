import type { ReactNode } from 'react';
import { createTranslator } from 'next-intl';

import type { Locale } from '@/app/config';
import { rebrandMessages } from '@/features/branding/utils/rebrand-text';

/**
 * The part of a next-intl translator the email templates use. Typed by hand
 * because the messages are loaded by a computed import, which the generated key
 * types cannot follow.
 */
export type EmailTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  /** Whether a message exists, for a label that falls back to a raw value. */
  has(key: string): boolean;
  rich(
    key: string,
    values: Record<
      string,
      string | number | ((chunks: ReactNode) => ReactNode)
    >,
  ): ReactNode;
};

/**
 * A translator for one email's strings, in one locale.
 *
 * Built from the message files directly rather than with `getTranslations`,
 * which needs a request to know where it is: mail is also sent from event
 * handlers and background work, and `createTranslator` needs only the locale and
 * the messages. The same files the panel uses, under the `emails` namespace.
 *
 * `productName` is the install's (spec B2): "Welcome to Ragen AI" in a subject
 * becomes the install's name, as the page titles do. Omitted, or the default,
 * the messages are used as they are.
 */
export async function getEmailTranslator(
  locale: Locale,
  namespace: string,
  productName?: string,
): Promise<EmailTranslator> {
  const catalogue = (await import(`@/app/messages/${locale}.json`)).default;
  const messages = productName
    ? rebrandMessages(catalogue, productName)
    : catalogue;

  return createTranslator({
    locale,
    messages,
    namespace: `emails.${namespace}` as never,
  }) as unknown as EmailTranslator;
}

/** `<strong>` for the rich-text tag of that name in a message. */
export const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

/** `<code>` for the rich-text tag of that name in a message. */
export const code = (chunks: ReactNode) => <code>{chunks}</code>;
