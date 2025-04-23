import { getTranslations } from 'next-intl/server';

import { DocumentCreator } from '@/app/components/ManageKnowledge/MarkdownDocumentsCreator/DocumentCreator';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge:create-document.title'),
  };
}

export default function CreateDocumentPage() {
  return (
    <div className="h-full flex-1 flex flex-col gap-4 ml-4 lg:ml-0 mb-[20px]">
      <DocumentCreator />
    </div>
  );
}
