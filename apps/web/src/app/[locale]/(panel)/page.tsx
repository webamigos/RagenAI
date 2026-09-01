import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function Index() {
  const locale = await getLocale();
  redirect(`/${locale}/new`);
}
