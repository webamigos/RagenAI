import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // This needs to be awaited
  const requested = await requestLocale;

  // Validate and provide fallback
  // Check if requested locale is valid
  const locale =
    requested && routing.locales.includes(requested as any)
      ? requested
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../app/messages/${locale}.json`)).default,
  };
});
