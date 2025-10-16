import { getTranslations } from 'next-intl/server';
import { AddFromUrl } from '@/app/components/ManageKnowledge/AddFromUrl';

type Props = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge:add-from-url.title'),
  };
}

export default function AddFromUrlPage() {
  return (
    <div className="h-full flex-1 flex flex-col gap-4 ml-4 lg:ml-0 mb-[20px]">
      <AddFromUrl />
    </div>
  );
}
