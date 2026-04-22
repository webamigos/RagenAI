'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HomeIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getFolderBreadcrumbs } from '@/app/actions/folders';
import type { BreadcrumbItem } from '@/features/documents/services/queries/get-folder-breadcrumbs-query';

type Props = {
  folderId: string | null;
  viewMode?: 'all' | 'my-files' | 'shared-with-me';
  onNavigate: (folderId: string | null) => void;
};

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia('(max-width: 768px)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

type BreadcrumbSegments = {
  visible: BreadcrumbItem[];
  hidden: BreadcrumbItem[];
};

function useBreadcrumbSegments(
  breadcrumbs: BreadcrumbItem[],
  isMobile: boolean,
): BreadcrumbSegments {
  const maxVisible = isMobile ? 1 : 4;

  if (breadcrumbs.length <= maxVisible) {
    return { visible: breadcrumbs, hidden: [] };
  }

  return {
    visible: breadcrumbs.slice(breadcrumbs.length - maxVisible),
    hidden: breadcrumbs.slice(0, breadcrumbs.length - maxVisible),
  };
}

const separatorClass = 'text-gray-300 dark:text-gray-600 shrink-0';
const segmentButtonClass =
  'max-w-[120px] truncate text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 font-medium transition-colors';

export function Breadcrumbs({ folderId, onNavigate }: Props) {
  const t = useTranslations('folders');
  const isMobile = useIsMobile();
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

  const { visible, hidden } = useBreadcrumbSegments(breadcrumbs, isMobile);

  return (
    <nav
      aria-label={t('breadcrumb-nav')}
      className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 min-w-0"
    >
      {/* Home / root */}
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 shrink-0 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <HomeIcon className="size-4" />
        <span>{t('knowledge-base')}</span>
      </button>

      {/* Overflow dropdown for hidden segments */}
      {hidden.length > 0 && (
        <>
          <ChevronRightIcon className={`size-3.5 ${separatorClass}`} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('more-folders')}
                title={hidden.map((h) => h.name).join(' / ')}
                className="px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors shrink-0"
              >
                ...
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {hidden.map((crumb) => (
                <DropdownMenuItem
                  key={crumb.id}
                  onClick={() => onNavigate(crumb.id)}
                >
                  {crumb.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Visible segments */}
      {visible.map((crumb, index) => {
        const isLast = index === visible.length - 1;
        return (
          <span key={crumb.id} className="flex items-center gap-1 min-w-0">
            <ChevronRightIcon className={`size-3.5 ${separatorClass}`} />
            {isLast ? (
              <span
                title={crumb.name}
                className="max-w-[160px] truncate font-semibold text-gray-900 dark:text-gray-100"
              >
                {crumb.name}
              </span>
            ) : (
              <button
                type="button"
                title={crumb.name}
                onClick={() => onNavigate(crumb.id)}
                className={segmentButtonClass}
              >
                {crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
