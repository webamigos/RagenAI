'use client';

import {
  useEffect,
  useState,
  useMemo,
  useTransition,
  useRef,
  useCallback,
} from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  MagnifyingGlassIcon,
  FolderIcon,
  PlusIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { EmptyState } from '@ragenai/common-ui/EmptyState';

import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { Link, useRouter } from '@/i18n/routing';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';
import {
  getActiveTemplatesAction,
  activateTemplateAction,
} from '@/app/actions/assistant-templates';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/app/lib/utils/format-relative-time';
import { logger } from '@/app/lib/utils/logger';
import { useAppSelector } from '@/store/hooks';
import { CreateProject } from '@/app/components/Sidebar/Projects/components/CreateProject';
import { AssistantDropdownMenu } from '@/app/components/Assistants/AssistantDropdownMenu';
import type { AssistantTemplateUserView } from '@/features/assistant-templates/contracts/assistant-template.types';
import { AssistantsGridSkeleton } from '@/app/[locale]/(panel)/assistants/AssistantsGridSkeleton';

type ProjectItem = {
  id: string;
  title: string;
  createdAt: Date;
  isStarred: boolean;
  isArchived: boolean;
  threads: { id: string }[];
};

export const AssistantsPage = () => {
  const t = useTranslations('assistants-page');
  const locale = useLocale();
  const router = useRouter();
  const { organization } = useOrganization();
  const { user } = useUser();
  const { defaultProjectId } = useAppSelector((state) => state.threads);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [templates, setTemplates] = useState<AssistantTemplateUserView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isActivating, startActivating] = useTransition();
  const templatesRef = useRef<HTMLDivElement>(null);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!organization?.id || !user?.id) {
        return;
      }
      setIsLoading(true);
      try {
        const [projectsResult, templatesResult] = await Promise.all([
          getProjects(organization.id, user.id),
          getActiveTemplatesAction(),
        ]);
        if (projectsResult.projects) {
          setProjects(projectsResult.projects as unknown as ProjectItem[]);
        }
        setTemplates(templatesResult);
      } catch (error) {
        logger.error({ error }, 'Failed to fetch projects');
      } finally {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    };
    fetchData();
  }, [organization?.id, user?.id]);

  const filteredProjects = useMemo(() => {
    const nonDefault = projects.filter((p) => p.id !== defaultProjectId);
    if (!searchQuery.trim()) {
      return nonDefault;
    }
    return nonDefault.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [projects, searchQuery, defaultProjectId]);

  const handleCreateSuccess = async () => {
    setIsCreateModalOpen(false);
    if (organization?.id && user?.id) {
      const result = await getProjects(organization.id, user.id);
      if (result.projects) {
        setProjects(result.projects as unknown as ProjectItem[]);
      }
    }
  };

  const handleStarred = useCallback((id: string, isStarred: boolean) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isStarred } : p)),
    );
  }, []);

  const handleRenamed = useCallback((id: string, title: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
  }, []);

  const handleArchived = useCallback((id: string, isArchived: boolean) => {
    setProjects((prev) =>
      isArchived ? prev.filter((p) => p.id !== id) : prev,
    );
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleActivateTemplate = (templatePublicId: string) => {
    startActivating(async () => {
      try {
        const result = await activateTemplateAction(templatePublicId);
        router.push(`/projects/${result.projectId}`);
      } catch (error) {
        logger.error({ error }, 'Failed to activate template');
      }
    });
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h1>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <PlusIcon className="size-4" />
          {t('create')}
        </Button>
      </div>

      {/* Global Assistants */}
      {!isLoading && templates.length > 0 && (
        <div className="mb-8" ref={templatesRef}>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3 uppercase tracking-wide">
            {t('global-assistants')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleActivateTemplate(template.id)}
                disabled={isActivating}
                className="group flex flex-col justify-between rounded-xl border border-brand-200 dark:border-brand-800/50 bg-gradient-to-br from-white to-brand-50/50 dark:from-zinc-800 dark:to-brand-950/20 p-5 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm transition-all min-h-[120px] text-left disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  {template.iconUrl ? (
                    <img
                      src={template.iconUrl}
                      alt=""
                      className="size-6 rounded object-cover shrink-0"
                    />
                  ) : (
                    <SparklesIcon className="size-5 text-brand-500 dark:text-brand-400 shrink-0" />
                  )}
                  <p className="text-sm font-medium text-zinc-950 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                    {template.name}
                  </p>
                </div>
                {template.description && (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {template.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

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
      {isLoading && !hasLoadedOnce.current && <AssistantsGridSkeleton />}
      {isLoading && hasLoadedOnce.current && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400" />
        </div>
      )}

      {/* Project grid */}
      {!isLoading && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="group relative flex rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all min-h-[120px]"
            >
              <Link
                href={`/projects/${project.id}`}
                className="flex flex-1 flex-col justify-between p-5 pr-12"
              >
                <div className="flex items-center gap-3">
                  <FolderIcon className="size-5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                  <p className="text-sm font-medium text-zinc-950 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                    {project.title}
                  </p>
                  {project.isStarred && (
                    <StarIconSolid
                      className="size-4 text-yellow-500 shrink-0"
                      aria-label={t('starred')}
                    />
                  )}
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
              <div className="absolute top-3 right-3">
                <AssistantDropdownMenu
                  assistant={{
                    id: project.id,
                    title: project.title,
                    isStarred: project.isStarred,
                    isArchived: project.isArchived,
                  }}
                  onStarred={handleStarred}
                  onRenamed={handleRenamed}
                  onArchived={handleArchived}
                  onDeleted={handleDeleted}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading &&
        filteredProjects.length === 0 &&
        (searchQuery.trim() ? (
          <EmptyState
            icon={
              <MagnifyingGlassIcon className="size-10 text-zinc-300 dark:text-zinc-600" />
            }
            title={t('no-search-results', { query: searchQuery })}
            description={t('no-search-results-description')}
          />
        ) : (
          <EmptyState
            icon={
              <FolderIcon className="size-10 text-zinc-300 dark:text-zinc-600" />
            }
            title={t('no-assistants')}
            description={t('no-assistants-description')}
            actions={[
              { label: t('create'), onClick: () => setIsCreateModalOpen(true) },
              ...(templates.length > 0
                ? [
                    {
                      label: t('browse-templates'),
                      onClick: () =>
                        templatesRef.current?.scrollIntoView({
                          behavior: 'smooth',
                        }),
                    },
                  ]
                : []),
            ]}
          />
        ))}

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
