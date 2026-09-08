import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';

/**
 * Moved to /organization/knowledge-analytics, where the rest of the
 * organization-scoped screens live. Kept as a redirect rather than deleted
 * because the page was linked from the sidebar and reachable on the demo
 * deployment, so bookmarks exist. Without it the settings catch-all would
 * quietly land those on /settings/general instead.
 */
export default async function MovedKnowledgeAnalyticsPage() {
  const locale = await getLocale();
  return redirect({ href: '/organization/knowledge-analytics', locale });
}
