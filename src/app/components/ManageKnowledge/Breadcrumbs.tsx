'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getFolderBreadcrumbs } from '@/app/actions/folders';
import type { BreadcrumbItem } from '@/features/documents/services/queries/get-folder-breadcrumbs-query';

type Props = {
  folderId: string | null;
  viewMode?: 'all' | 'my-files' | 'shared-with-me';
  onNavigate: (folderId: string | null) => void;
};

export function Breadcrumbs({ folderId, viewMode, onNavigate }: Props) {
  const t = useTranslations('folders');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  useEffect(() => {
    if (folderId) {
      getFolderBreadcrumbs(folderId)
        .then(setBreadcrumbs)
        .catch(() => setBreadcrumbs([]));
    } else {
      setBreadcrumbs([]);
    }
  }, [folderId]);

  let rootLabel = t('all-files');
  if (viewMode === 'my-files') {
    rootLabel = t('my-files');
  } else if (viewMode === 'shared-with-me') {
    rootLabel = t('shared-with-me');
  }

  return (
    <nav className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
      <button
        onClick={() => onNavigate(null)}
        className="hover:text-gray-900 dark:hover:text-gray-100 font-medium"
      >
        {rootLabel}
      </button>
      {breadcrumbs.map((crumb) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <span className="text-gray-300 dark:text-gray-600">&gt;</span>
          <button
            onClick={() => onNavigate(crumb.id)}
            className="hover:text-gray-900 dark:hover:text-gray-100 font-medium"
          >
            {crumb.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
