import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('resend', () => ({
  Resend: class {
    constructor(public apiKey?: string) {}
  },
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  getMailProvider,
  getResendProvider,
  resetMailProviderForTests,
} from '../index';
import { ConsoleMailProvider } from '../console-provider';
import { ResendMailProvider } from '../resend-provider';
import { SmtpMailProvider } from '../smtp-provider';

/** Every variable the selection reads, so no test inherits another's state. */
const MAIL_ENV = [
  'MAIL_PROVIDER',
  'RESEND_API_KEY',
  'SMTP_HOST',
  'NODE_ENV',
] as const;

describe('getMailProvider', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(MAIL_ENV.map((key) => [key, process.env[key]]));
    for (const key of MAIL_ENV) {
      delete process.env[key];
    }
    resetMailProviderForTests();
  });

  afterEach(() => {
    // NODE_ENV is readonly to TypeScript, so tests stub it instead of
    // assigning; the loop below still restores the rest.
    vi.unstubAllEnvs();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetMailProviderForTests();
  });

  it('uses SMTP when only SMTP is configured', () => {
    process.env.SMTP_HOST = 'smtp.example.com';

    expect(getMailProvider()).toBeInstanceOf(SmtpMailProvider);
    expect(getResendProvider()).toBeNull();
  });

  it('uses Resend when only a Resend key is configured', () => {
    process.env.RESEND_API_KEY = 're_test';

    expect(getMailProvider()).toBeInstanceOf(ResendMailProvider);
    expect(getResendProvider()).not.toBeNull();
  });

  it('lets MAIL_PROVIDER override the detected transport', () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.MAIL_PROVIDER = 'smtp';

    expect(getMailProvider()).toBeInstanceOf(SmtpMailProvider);
  });

  it('falls back to logging outside production when nothing is configured', () => {
    vi.stubEnv('NODE_ENV', 'development');

    expect(getMailProvider()).toBeInstanceOf(ConsoleMailProvider);
  });

  it('refuses to silently drop mail in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => getMailProvider()).toThrow(/No mail provider configured/);
  });

  it('still allows an explicit console provider in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.MAIL_PROVIDER = 'console';

    expect(getMailProvider()).toBeInstanceOf(ConsoleMailProvider);
  });

  it('rejects an unknown MAIL_PROVIDER rather than guessing', () => {
    process.env.MAIL_PROVIDER = 'sendgrid';

    expect(() => getMailProvider()).toThrow(/Unknown MAIL_PROVIDER/);
  });
});
