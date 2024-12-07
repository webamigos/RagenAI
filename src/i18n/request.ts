import { routing } from './routing';

import { type Locale } from '../app/config';

const getRequestConfig = async ({
  requestLocale,
}: {
  requestLocale: Locale;
}) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that the incoming locale is valid
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../app/messages/${locale}.json`)).default,
  };
};

export default getRequestConfig;
