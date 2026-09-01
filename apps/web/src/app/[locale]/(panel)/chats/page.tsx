import { getTranslations } from 'next-intl/server';
import { ChatsPage } from './ChatsPage';
import type { PropsWihLocale } from '@/app/lib/types/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('chats.title') };
}

export default function Page() {
  return <ChatsPage />;
}
