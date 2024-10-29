import { AdminPanel } from '@/app/components/AdminPanel';
import { getTranslations } from 'next-intl/server';
export const dynamic = 'force-dynamic';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge.title'),
  };
}

export default function AdminPage() {
  return <AdminPanel />;
}
