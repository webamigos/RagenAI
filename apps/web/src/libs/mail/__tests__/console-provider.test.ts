import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const warn = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn, debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@react-email/render', () => ({
  render: vi.fn(
    async () => '<a href="https://app.example.com/verify?token=abc">Verify</a>',
  ),
}));

import { ConsoleMailProvider } from '../console-provider';
import { createElement } from 'react';

const message = {
  from: 'ragen@example.com',
  to: 'ada@example.com',
  subject: 'Verify your address',
  react: createElement('div'),
};

describe('ConsoleMailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // NODE_ENV is readonly to TypeScript, so it is stubbed rather than
    // assigned; this restores it whichever test set it.
    vi.unstubAllEnvs();
  });

  it('logs the links so a local install can complete sign-up', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await new ConsoleMailProvider().send(message);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        links: ['https://app.example.com/verify?token=abc'],
      }),
      expect.any(String),
    );
  });

  it('withholds the links in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await new ConsoleMailProvider().send(message);

    // Verification and magic-link URLs are bearer credentials, and production
    // logs are shipped somewhere central.
    const [payload] = warn.mock.calls[0];
    expect(payload).not.toHaveProperty('links');
    expect(JSON.stringify(payload)).not.toContain('token=abc');
    expect(payload).toMatchObject({ to: 'ada@example.com' });
  });
});
