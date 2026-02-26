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
  const threadContext = useAppSelector(
    (state) => state.assistant.threadContext,
  );

  const breadcrumbs: BreadcrumbItem[] = useMemo(() => {
    const items: BreadcrumbItem[] = [];

    if (pathname.includes('/chats/') && threadId) {
      // Thread view - check if thread belongs to a project via threadContext
      if (threadContext?.project) {
        items.push({
          label: t('projects'),
          href: '/projects',
        });
        items.push({
          label: threadContext.project.title,
          href: `/projects/${threadContext.project.public_id}`,
        });
      } else {
        items.push({
          label: t('mainThreads'),
          href: '/new',
        });
      }

      // Thread title
      let threadTitle = t('conversation');

      // Try to find title from sidebar projects or userThreads
      if (threadContext?.project) {
        const project = projects.find(
          (p) => p.public_id === threadContext.project!.public_id,
        );
        if (project) {
          const thread = project.threads?.find((t) => t.public_id === threadId);
          if (thread?.messages?.[0]?.content?.trim()) {
            const content = thread.messages[0].content;
            threadTitle =
              content.length > 50 ? content.substring(0, 50) + '...' : content;
          }
        }
      } else {
        const thread = userThreads.find((t) => t.public_id === threadId);
        if (thread?.messages?.[0]?.content?.trim()) {
          const content = thread.messages[0].content;
          threadTitle =
            content.length > 50 ? content.substring(0, 50) + '...' : content;
        }
      }

      items.push({
        label: threadTitle,
        current: true,
      });
    } else if (pathname.includes('/projects')) {
      const pathSegments = pathname.split('/').filter(Boolean);
      const projectIndex = pathSegments.indexOf('projects');
      const projectId = pathSegments[projectIndex + 1];

      items.push({
        label: t('projects'),
        href: projectId ? '/projects' : undefined,
      });

      if (projectId) {
        const project = projects.find((p) => p.public_id === projectId);
        const projectTitle = project?.title || t('unknownProject');
        items.push({
          label: projectTitle,
          current: true,
        });
      }
    }

    return items;
  }, [pathname, threadId, projects, userThreads, threadContext, t]);

  return breadcrumbs;
};
