'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { DocumentCreator } from '@/app/components/ManageKnowledge/MarkdownDocumentsCreator/DocumentCreator';

export default function CreateDocumentPage() {
  const t = useTranslations('Metadata');

  useEffect(() => {
    document.title = t('manage-knowledge:create-document.title');
  }, [t]);

  return (
    <div className="h-full flex-1 flex flex-col gap-4 mb-[20px]">
      <DocumentCreator />
    </div>
  );
}
