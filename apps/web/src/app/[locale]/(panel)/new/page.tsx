import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ChatInterface } from '../../../components/ChatInterface';
import { type PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('index.title'),
  };
}

export default async function NewChatPage({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Centred in the panel, not pinned to the top. This screen is a single
  // short block — greeting, question, composer, four cards — and left at the
  // top it sat above a half-screen of nothing.
  //
  // `flex-1` is how a page opts into the full height: the shell's content
  // column is `items-stretch` + `flex flex-col` precisely so a page can ask
  // for it (see SidebarLayout). `items-center` then centres within it. A
  // thread with messages does not do this — it grows downward and scrolls, so
  // only the empty state centres.
  return (
    <div className="flex flex-1 items-center justify-center">
      <ChatInterface />
    </div>
  );
}
