import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { timezone } from '@/app/config';

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
    // The same zone the client provider is given (`app/[locale]/layout.tsx`).
    // Without it, server components' `getFormatter()` — every date on the
    // Brain pages — used the process's zone, UTC in a container, and showed
    // times an hour or two off the rest of the panel.
    timeZone: timezone,
    messages: (await import(`../app/messages/${locale}.json`)).default,
  };
});
