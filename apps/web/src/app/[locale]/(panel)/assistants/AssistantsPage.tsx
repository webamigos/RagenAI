'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  MagnifyingGlassIcon,
  FolderIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

import { useOrganization, useUser } from '@/app/hooks/use-auth';
import { Link } from '@/i18n/routing';
import { getProjects } from '@/app/components/Sidebar/Projects/actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { logger } from '@/app/lib/utils/logger';
import { formatRelativeTime } from '@/app/lib/utils/format-relative-time';
import { useAppSelector } from '@/store/hooks';
import { CreateProject } from '@/app/components/Sidebar/Projects/components/CreateProject';
import { AssistantDropdownMenu } from '@/app/components/Assistants/AssistantDropdownMenu';
import { AssistantsGridSkeleton } from './AssistantsGridSkeleton';

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
  const { organization } = useOrganization();
  const { user } = useUser();
  const { defaultProjectId } = useAppSelector((state) => state.threads);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const hasLoadedOnce = useRef<boolean>(false);

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
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    };
    fetchProjects();
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

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 mb-6">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="font-display text-xl font-semibold text-foreground">
            {t('title')}
          </h1>
          {/*
            The count is only shown once the list has actually loaded. Before
            that `projects` is an empty array, and "0 in this organization" is
            a statement about the organization rather than about the fetch.
          */}
          {hasLoadedOnce.current && !isLoading && (
            <p className="truncate text-xs text-muted-foreground">
              {t('assistant-count', { count: projects.length })}
            </p>
          )}
        </div>
        {/*
          Navy, because creating an assistant is the page's action and
          `docs/panel-ux-rules.md` rule 15 makes navy the only non-destructive
          action colour. It was an outline button that read like a filter.
        */}
        <Button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5"
        >
          <PlusIcon className="size-4" />
          {t('create')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
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
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-border" />
        </div>
      )}

      {/*
        Project grid. It fills the width instead of stopping at two columns: a
        fixed `sm:grid-cols-2` left half the pane empty on a wide screen and
        made each card wider than its content needs, where `minmax` lets the
        column count follow the pane.
      */}
      {!isLoading && filteredProjects.length > 0 && (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              // A card is `border border-border bg-card rounded-lg`, per phase 3.
              // The radius was `xl` and the hover added a shadow, which the
              // token layer reserves for popovers, dropdowns, dialogs, toasts
              // and the command palette — surfaces that float above the page.
              className="group relative flex rounded-lg border border-border bg-card dark:bg-muted hover:border-border/90 transition-colors min-h-[120px]"
            >
              <Link
                href={`/assistants/${project.id}`}
                className="flex flex-1 flex-col justify-between p-5 pr-12"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
                  >
                    <FolderIcon className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-300 transition-colors">
                    {project.title}
                  </p>
                  {project.isStarred && (
                    <StarIconSolid
                      className="size-4 text-pending shrink-0"
                      aria-label={t('starred')}
                    />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
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
      {!isLoading && filteredProjects.length === 0 && (
        <div className="text-center py-12">
          <FolderIcon className="size-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t('no-assistants')}</p>
          <p className="text-sm text-muted-foreground mt-1">
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
