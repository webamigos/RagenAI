import { getBaseUrl } from '@/app/emails/utils/base-url';

import type { EmailBranding } from '../../contracts/branding.types';
import { getInstanceBrandingQuery } from './get-instance-branding-query';

/**
 * The branding an outgoing email carries.
 *
 * The same answer as the panel's, with the logo made absolute: a mail client
 * fetches it from outside, with no page to resolve a relative URL against.
 * When the origin is not configured the logo is dropped rather than the
 * email — `getBaseUrl` throws then, and the mailer reports the links it
 * cannot build on its own.
 */
export async function getEmailBrandingQuery(): Promise<EmailBranding> {
  const branding = await getInstanceBrandingQuery();

  let logoUrl: string | null = null;
  if (branding.logoUrl) {
    try {
      logoUrl = `${getBaseUrl()}${branding.logoUrl}`;
    } catch {
      logoUrl = null;
    }
  }

  return {
    productName: branding.productName,
    logoUrl,
    isCustom: branding.isCustom,
  };
}
