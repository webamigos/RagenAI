import type { MailProvider } from './types';
import { ResendMailProvider } from './resend-provider';
import { SmtpMailProvider } from './smtp-provider';

export type { MailProvider, SendMailOptions } from './types';

let instance: MailProvider | null = null;

export function getMailProvider(): MailProvider {
  if (instance) {
    return instance;
  }

  const provider = process.env.MAIL_PROVIDER || 'resend';

  switch (provider) {
    case 'resend': {
      instance = new ResendMailProvider();
      break;
    }
    case 'smtp': {
      instance = new SmtpMailProvider();
      break;
    }
    default:
      throw new Error(
        `Unknown MAIL_PROVIDER: "${provider}". Supported values: "resend", "smtp".`,
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
