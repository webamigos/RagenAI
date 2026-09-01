import { getTranslations } from 'next-intl/server';

import { DocumentOptimizer } from '@/app/components/ManageKnowledge/DocumentOptimizer/DocumentOptimizer';

type Props = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge:optimize-document.title'),
  };
}

export default function OptimizeDocumentPage() {
  return (
    <div className="h-full flex-1 flex flex-col gap-4 ml-4 lg:ml-0 mb-[20px]">
      <DocumentOptimizer />
    </div>
  );
}
