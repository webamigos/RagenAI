'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getFolderBreadcrumbs } from '@/app/actions/folders';
import type { BreadcrumbItem } from '@/features/documents/services/queries/get-folder-breadcrumbs-query';

type Props = {
  folderId: number | null;
  viewMode?: 'all' | 'my-files' | 'shared-with-me';
  onNavigate: (folderId: number | null) => void;
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

  const rootLabel =
    viewMode === 'my-files'
      ? t('my-files')
      : viewMode === 'shared-with-me'
        ? t('shared-with-me')
        : t('all-files');

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
