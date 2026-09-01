import type { MailProvider } from './types';
import { ConsoleMailProvider } from './console-provider';
import { ResendMailProvider } from './resend-provider';
import { SmtpMailProvider } from './smtp-provider';

export type { MailProvider, SendMailOptions } from './types';

let instance: MailProvider | null = null;

const isSet = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Pick a transport from what is actually configured.
 *
 * Resend used to be the unconditional default, which is the wrong way round for
 * a self-hosted install: someone who sets SMTP_HOST and nothing else got a
 * Resend client with no API key, and mail failed at send time with an error
 * about Resend they never asked for. Detection order is credentials-first, so
 * the common cases need no MAIL_PROVIDER at all — set it explicitly only to
 * override, or when both are configured.
 */
function detectProvider(): 'resend' | 'smtp' | 'console' {
  const explicit = process.env.MAIL_PROVIDER;
  if (isSet(explicit)) {
    return explicit as 'resend' | 'smtp' | 'console';
  }

  if (isSet(process.env.RESEND_API_KEY)) {
    return 'resend';
  }

  if (isSet(process.env.SMTP_HOST)) {
    return 'smtp';
  }

  // Nothing configured. Outside production that means a laptop, where logging
  // the link is what keeps sign-up completable; in production it means an
  // operator is about to silently lose every invitation, so say so instead.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No mail provider configured. Set RESEND_API_KEY, or SMTP_HOST (with ' +
        'SMTP_USER / SMTP_PASS), or MAIL_PROVIDER=console to accept that no ' +
        'email will be delivered.',
    );
  }

  return 'console';
}

export function getMailProvider(): MailProvider {
  if (instance) {
    return instance;
  }

  const provider = detectProvider();

  switch (provider) {
    case 'resend': {
      instance = new ResendMailProvider();
      break;
    }
    case 'smtp': {
      instance = new SmtpMailProvider();
      break;
    }
    case 'console': {
      instance = new ConsoleMailProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown MAIL_PROVIDER: "${provider}". Supported values: "resend", "smtp", "console".`,
      );
  }

  return instance;
}

/**
 * Access the Resend-specific provider for features like contact segments.
 * Returns null when not using Resend.
 */
export function getResendProvider(): ResendMailProvider | null {
  const provider = getMailProvider();
  if (provider instanceof ResendMailProvider) {
    return provider;
  }
  return null;
}

/** Test seam — the provider is cached for the process lifetime otherwise. */
export function resetMailProviderForTests(): void {
  instance = null;
}
