'use client';

import { useMemo } from 'react';
import { usePathname } from '@/i18n/routing';
import { useAppSelector } from '@/store/hooks';
import { useTranslations } from 'next-intl';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export const useBreadcrumbs = (threadId?: string) => {
  const pathname = usePathname();
  const t = useTranslations('Breadcrumbs');
  const { projects } = useAppSelector((state) => state.sidebar);
  const { userThreads } = useAppSelector((state) => state.threads);

  const breadcrumbs: BreadcrumbItem[] = useMemo(() => {
    const items: BreadcrumbItem[] = [];

    // Analiza ścieżki URL
    const pathSegments = pathname.split('/').filter(Boolean);

    // Sprawdź czy jesteśmy w ścieżce asystentów vs głównych wątków
    if (pathSegments.includes('assistants')) {
      // Ścieżka: /assistants/[projectId]/threads/[threadId]
      const projectIndex = pathSegments.indexOf('assistants');
      const projectId = pathSegments[projectIndex + 1];
      const isInThread = pathSegments.includes('threads') && threadId;

      // Dodaj breadcrumb dla asystentów
      items.push({
        label: t('assistants'),
        href: '/', // Link do głównej strony aplikacji
      });

      if (projectId) {
        // Znajdź projekt w store
        const project = projects.find((p) => p.public_id === projectId);
        const projectTitle = project?.title || t('unknownProject');

        items.push({
          label: projectTitle,
          href: isInThread ? `/assistants/${projectId}` : undefined,
        });

        if (isInThread) {
          // Znajdź wątek w projekcie
          let threadTitle = t('conversation');

          if (project && threadId) {
            const thread = project.threads?.find(
              (t) => t.public_id === threadId
            );
            if (thread && thread.messages && thread.messages.length > 0) {
              // Użyj pierwszych 50 znaków pierwszej wiadomości jako tytuł
              const firstMessage = thread.messages[0]?.content;
              if (firstMessage && firstMessage.trim()) {
                threadTitle =
                  firstMessage.length > 50
                    ? firstMessage.substring(0, 50) + '...'
                    : firstMessage;
              }
            }
          }

          items.push({
            label: threadTitle,
            current: true,
          });
        }
      }
    } else if (pathSegments.includes('threads')) {
      // Ścieżka: /threads/[publicId] - główne wątki
      items.push({
        label: t('mainThreads'),
        href: '/', // Link do głównej strony aplikacji
      });

      if (threadId) {
        // Znajdź wątek w głównych wątkach
        const thread = userThreads.find((t) => t.public_id === threadId);
        let threadTitle = t('conversation');

        if (thread && thread.messages && thread.messages.length > 0) {
          // Użyj pierwszych 50 znaków pierwszej wiadomości jako tytuł
          const firstMessage = thread.messages[0]?.content;
          if (firstMessage && firstMessage.trim()) {
            threadTitle =
              firstMessage.length > 50
                ? firstMessage.substring(0, 50) + '...'
                : firstMessage;
          }
        }

        items.push({
          label: threadTitle,
          current: true,
        });
      }
    }

    return items;
  }, [pathname, threadId, projects, userThreads, t]);

  return breadcrumbs;
};
