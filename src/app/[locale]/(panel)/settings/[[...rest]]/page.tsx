import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';

export default async function SettingsIndexPage() {
  const locale = await getLocale();
  return redirect({ href: '/settings/general', locale });
}
