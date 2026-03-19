'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  MagnifyingGlassIcon,
  FolderIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { Link } from '@/i18n/routing';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';
import { Input } from '@/components/ui/input';
import { logger } from '@/app/lib/utils/logger';
import { useAppSelector } from '@/store/hooks';
import { CreateProject } from '@/app/components/Sidebar/Projects/components/CreateProject';

type ProjectItem = {
  publicId: string;
  title: string;
  createdAt: Date;
  threads: { publicId: string }[];
};

function formatRelativeTime(date: Date, locale: string): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffHours < 24) {
    return rtf.format(-diffHours, 'hour');
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return rtf.format(-diffDays, 'day');
  }
  return new Date(date).toLocaleDateString(locale);
}

export const AssistantsPage = () => {
  const t = useTranslations('assistants-page');
  const locale = useLocale();
  const { organization } = useOrganization();
  const { user } = useUser();
  const { defaultProjectPublicId } = useAppSelector((state) => state.threads);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!organization?.id || !user?.id) {
        return;
      }
      setIsLoading(true);
      try {
        const result = await getProjects(organization.id, user.id);
        if (result.projects) {
          setProjects(result.projects as unknown as ProjectItem[]);
        }
      } catch (error) {
        logger.error({ error }, 'Failed to fetch projects');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [organization?.id, user?.id]);

  const filteredProjects = useMemo(() => {
    const nonDefault = projects.filter(
      (p) => p.publicId !== defaultProjectPublicId,
    );
    if (!searchQuery.trim()) {
      return nonDefault;
    }
    return nonDefault.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [projects, searchQuery, defaultProjectPublicId]);

  const handleCreateSuccess = async () => {
    setIsCreateModalOpen(false);
    if (organization?.id && user?.id) {
      const result = await getProjects(organization.id, user.id);
      if (result.projects) {
        setProjects(result.projects as unknown as ProjectItem[]);
      }
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h1>
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <PlusIcon className="size-4" />
          {t('create')}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
        <Input
          type="text"
          placeholder={t('search-placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400" />
        </div>
      )}

      {/* Project grid */}
      {!isLoading && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredProjects.map((project) => (
            <Link
              key={project.publicId}
              href={`/assistants/${project.publicId}`}
              className="group flex flex-col justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all min-h-[120px]"
            >
              <div className="flex items-center gap-3">
                <FolderIcon className="size-5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                <p className="text-sm font-medium text-zinc-950 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {project.title}
                </p>
              </div>
              <div className="flex items-center gap-3 mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                <span>
                  {t('thread-count', { count: project.threads.length })}
                </span>
                <span>
                  {t('updated', {
                    time: formatRelativeTime(project.createdAt, locale),
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredProjects.length === 0 && (
        <div className="text-center py-12">
          <FolderIcon className="size-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-500 dark:text-zinc-400">
            {t('no-assistants')}
          </p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            {t('no-assistants-description')}
          </p>
        </div>
      )}

      {/* Create project modal */}
      {isCreateModalOpen && (
        <CreateProject
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          refreshProjects={handleCreateSuccess}
        />
      )}
    </div>
  );
};
