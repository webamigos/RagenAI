import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';

/**
 * Moved to /organization/pii-policy. Kept as a redirect for the same reason
 * as its sibling: the knowledge-base upload dialog linked here by absolute
 * path, so the old URL is in circulation.
 */
export default async function MovedPiiPolicyPage() {
  const locale = await getLocale();
  return redirect({ href: '/organization/pii-policy', locale });
}
