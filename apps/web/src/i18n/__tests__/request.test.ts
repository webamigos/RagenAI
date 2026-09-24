import { describe, it, expect, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getRequestConfig: <T>(fn: T) => fn,
}));

import requestConfig from '../request';
import { defaultLocale, timezone } from '@/app/config';

type Config = (params: {
  requestLocale: Promise<string | undefined>;
}) => Promise<{ locale: string; timeZone?: string }>;

describe('i18n request config', () => {
  // Server components format dates with `getFormatter()`, which reads this
  // config. Without a zone they used the process's — UTC in a container —
  // while the client provider used Europe/Warsaw.
  it('gives server-side formatters the same time zone as the client', async () => {
    const config = await (requestConfig as unknown as Config)({
      requestLocale: Promise.resolve('en'),
    });
    expect(config.timeZone).toBe(timezone);
  });

  it('falls back to the default locale for an unknown one', async () => {
    const config = await (requestConfig as unknown as Config)({
      requestLocale: Promise.resolve('xx'),
    });
    expect(config.locale).toBe(defaultLocale);
  });
});
