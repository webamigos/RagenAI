import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';

export default async function Index() {
  const locale = await getLocale();
  redirect({ href: '/new', locale });
}
