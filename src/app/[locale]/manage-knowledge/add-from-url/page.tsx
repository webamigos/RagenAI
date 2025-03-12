'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AddFromUrl } from '@/app/components/ManageKnowledge/AddFromUrl';

export default function AddFromUrlPage() {
  const t = useTranslations('Metadata');

  useEffect(() => {
    document.title = t('manage-knowledge:add-from-url.title');
  }, [t]);

  return (
    <div className="h-full flex-1 flex flex-col gap-4 ml-4 lg:ml-0 mb-[20px]">
      <AddFromUrl />
    </div>
  );
}
