import { cookies, headers } from 'next/headers';

import { defaultLocale, locales, type Locale } from '@/app/config';

/**
 * Which language an outgoing email is written in.
 *
 * The app stores no language preference for a user, so the only signal is the
 * request that caused the email: an administrator inviting someone, a visitor
 * signing up, a person asking for a password reset. In that order of trust:
 *
 *   1. a locale the caller names (the invitation actions capture it up front,
 *      because the magic-link email is sent a few milliseconds later from a
 *      callback that has lost the request);
 *   2. the `NEXT_LOCALE` cookie next-intl sets on the panel;
 *   3. the browser's `Accept-Language`, for someone who has never had a cookie;
 *   4. the application default.
 *
 * It never throws. Mail is sent from places with no request at all — an event
 * handler, a background job — where `cookies()` and `headers()` themselves
 * throw, and an email that cannot pick a language must still go out in one.
 */

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (locales as readonly string[]).includes(value)
  );
}

/**
 * The best match for an `Accept-Language` header, or null.
 *
 * Only the primary subtag is compared (`pt-BR` is `pt`), and `no` and `nn` are
 * read as Bokmål, the one Norwegian the app ships.
 */
export function pickLocaleFromAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) {
    return null;
  }

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;

      return { tag: tag.trim().toLowerCase(), weight };
    })
    .filter(({ tag, weight }) => tag !== '' && tag !== '*' && weight > 0)
    .sort((a, b) => b.weight - a.weight);

  for (const { tag } of ranked) {
    const primary = tag.split('-')[0];
    const candidate = primary === 'no' || primary === 'nn' ? 'nb' : primary;

    if (isLocale(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function resolveEmailLocale(
  explicit?: string | null,
): Promise<Locale> {
  if (isLocale(explicit)) {
    return explicit;
  }

  try {
    const fromCookie = (await cookies()).get('NEXT_LOCALE')?.value;
    if (isLocale(fromCookie)) {
      return fromCookie;
    }

    const fromHeader = pickLocaleFromAcceptLanguage(
      (await headers()).get('accept-language'),
    );
    if (fromHeader) {
      return fromHeader;
    }
  } catch {
    // No request: an event handler or a job. The default is the answer.
  }

  return defaultLocale;
}
