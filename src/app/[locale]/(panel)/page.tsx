import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';

export default async function Index() {
  const locale = await getLocale();
  redirect(`/${locale}/new`);
}
