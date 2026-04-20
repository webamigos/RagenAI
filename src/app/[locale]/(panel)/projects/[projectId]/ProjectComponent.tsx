'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
  ChatBubbleLeftIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Link } from '@/i18n/routing';
import { useClientOnly } from '@/app/hooks/useClientOnly';
import { formatRelativeTime } from '@/app/lib/utils/format-relative-time';
import { logger } from '@/app/lib/utils/logger';
import { fetchProject } from '@/app/lib/services/api';
import { statusToast } from '@/app/lib/utils/toast';
import {
  getProjectFiles,
  getProjectStorageInfo,
  deleteProjectFileAction,
} from '@/app/actions';

import { NewChatInterface } from '@/app/components/NewChatInterface';
import { ProjectInstructionForm } from '@/app/components/Projects/ProjectInstructions/ProjectInstructionForm';
import { getProjectInstructionAction } from '@/app/components/Projects/ProjectInstructions/actions';
import { ShareDialogTrigger } from '@/app/components/Projects/ShareDialog/ShareDialogTrigger';
import { Checkbox } from '@ragenai/tui';
import { StorageProgressBar } from '@/app/components/Storage/StorageProgressBar';
import { InlineFileCard } from '@/app/components/Storage/InlineFileCard';
import { KnowledgeBasePickerDialog } from '@/app/components/KnowledgeBasePickerDialog';
import { GoogleDrivePickerDialog } from '@/app/components/GoogleDrivePickerDialog';
import { FirefliesPickerDialog } from '@/app/components/FirefliesPickerDialog';
import {
  isDriveConnected,
  importDriveFileToProject,
  syncDriveProject,
} from '@/app/actions/google-drive';
import { isFirefliesConnected } from '@/app/actions/fireflies';
import { ProjectMcpProviders } from '@/app/components/Projects/ProjectMcpProviders/ProjectMcpProviders';
import { importFilesToProject } from '@/app/actions';

import type { FileType } from '@/generated/prisma/browser';

type ProjectThread = {
  id: string;
  title: string | null;
  createdAt: string;
  isStarred: boolean;
  visitorId: string | null;
  userId: string | null;
  source: 'UI' | 'API' | 'PUBLIC' | 'CHATBOT';
  messages: { content: string }[];
};

type Project = {
  id: string;
  title: string;
  isPublic: boolean;
  accessToken: string | null;
  publishedAt: string | null;
  chatbotEnabled: boolean;
  templateId: string | null;
  template: { name: string; iconUrl: string | null } | null;
  threads: ProjectThread[];
};

type ProjectFile = {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: FileType;
  createdAt: Date | null;
  metadata?: Record<string, unknown> | null;
  parsingStatus?: string;
  embeddingStatus?: string;
};

type Props = {
  projectId: string;
};

function getThreadTitle(thread: ProjectThread, fallback: string): string {
  if (thread.title) {
    return thread.title;
  }
  // Use first message content as fallback title
  const firstMessage = thread.messages[0]?.content;
  if (firstMessage) {
    return firstMessage.length > 100
      ? `${firstMessage.substring(0, 100)}...`
      : firstMessage;
  }
  return fallback;
}

export function ProjectComponent({ projectId }: Props) {
  const isReady = useClientOnly();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionText, setInstructionText] = useState<string | null>(null);

  // File state
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageLimit, setStorageLimit] = useState(20 * 1024 * 1024);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [isKbPickerOpen, setIsKbPickerOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isFirefliesPickerOpen, setIsFirefliesPickerOpen] = useState(false);
  const [hasDriveConnector, setHasDriveConnector] = useState(false);
  const [hasFirefliesConnector, setHasFirefliesConnector] = useState(false);
  const [hasDriveFiles, setHasDriveFiles] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const defaultThreadTab = useMemo((): 'my' | 'public' | 'api' => {
    if (!project) {
      return 'my';
    }
    const hasUi = project.threads.some((t) => t.source === 'UI');
    if (hasUi) {
      return 'my';
    }
    const hasPublic = project.threads.some(
      (t) => t.source === 'PUBLIC' || t.source === 'CHATBOT',
    );
    if (hasPublic) {
      return 'public';
    }
    const hasApi = project.threads.some((t) => t.source === 'API');
    if (hasApi) {
      return 'api';
    }
    return 'my';
  }, [project]);
  const [threadTab, setThreadTab] = useState<'my' | 'public' | 'api'>('my');
  // Update tab when project loads and 'my' tab would be empty
  useEffect(() => {
    setThreadTab(defaultThreadTab);
  }, [defaultThreadTab]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { errorToast, successToast, infoToast } = statusToast();
  const t = useTranslations('projects');
  const tAttach = useTranslations('prompt-attachments');
  const locale = useLocale();

  useEffect(() => {
    isDriveConnected()
      .then(setHasDriveConnector)
      .catch(() => setHasDriveConnector(false));
    isFirefliesConnected()
      .then(setHasFirefliesConnector)
      .catch(() => setHasFirefliesConnector(false));
  }, []);

  const loadFiles = useCallback(async (pubId: string) => {
    try {
      const [filesResult, storageInfo] = await Promise.all([
        getProjectFiles(pubId),
        getProjectStorageInfo(pubId),
      ]);
      if (filesResult.files) {
        const projectFiles = filesResult.files as ProjectFile[];
        setFiles(projectFiles);
        setHasDriveFiles(
          projectFiles.some(
            (f) =>
              f.metadata &&
              typeof f.metadata === 'object' &&
              'driveFileId' in f.metadata,
          ),
        );
      }
      setStorageUsed(storageInfo.usedBytes);
      setStorageLimit(storageInfo.limitBytes);
    } catch {
      // silent - files section is supplementary
    }
  }, []);

  // Track processing files to detect completion
  const prevProcessingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const processingIds = new Set(
      files
        .filter(
          (f) =>
            (f.embeddingStatus &&
              f.embeddingStatus !== 'COMPLETED' &&
              f.embeddingStatus !== 'FAILED') ||
            (f.parsingStatus &&
              f.parsingStatus !== 'COMPLETED' &&
              f.parsingStatus !== 'FAILED'),
        )
        .map((f) => f.id),
    );

    // Check if any previously processing files are now completed
    if (prevProcessingIdsRef.current.size > 0) {
      const newlyCompleted = files.filter(
        (f) =>
          prevProcessingIdsRef.current.has(f.id) &&
          f.embeddingStatus === 'COMPLETED',
      );
      if (newlyCompleted.length > 0) {
        successToast({
          message: t('project-view.files-processed', {
            count: newlyCompleted.length,
          }),
        });
      }

      const newlyFailed = files.filter(
        (f) =>
          prevProcessingIdsRef.current.has(f.id) &&
          (f.embeddingStatus === 'FAILED' || f.parsingStatus === 'FAILED'),
      );
      if (newlyFailed.length > 0) {
        errorToast({
          message: t('project-view.files-failed', {
            count: newlyFailed.length,
          }),
        });
      }
    }

    prevProcessingIdsRef.current = processingIds;

    if (processingIds.size === 0 || !project) {
      return;
    }

    const interval = setInterval(() => {
      loadFiles(project.id);
    }, 5000);

    return () => clearInterval(interval);
  }, [files, project, loadFiles, successToast, errorToast, t]);

  useEffect(() => {
    async function loadProject() {
      try {
        const projectData = await fetchProject(projectId);
        setProject(projectData);
        loadFiles(projectData.id);
        getProjectInstructionAction(projectData.id).then((result) => {
          if (result.success && result.instruction) {
            setInstructionText(result.instruction);
          }
        });
      } catch (error) {
        logger.error('Error loading project:', { error: error });
        errorToast({ message: t('error.fetching-error') });
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSyncDrive = async () => {
    if (!project || isSyncing) {
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncDriveProject(project.id);
      if (result.success) {
        if (result.updatedCount > 0) {
          successToast({
            message: t('upload.sync-complete', {
              newCount: 0,
              updatedCount: result.updatedCount,
            }),
          });
        } else {
          infoToast({ message: t('upload.sync-up-to-date') });
        }
      } else {
        errorToast({ message: t('upload.sync-failed') });
      }
      loadFiles(project.id);
    } catch {
      errorToast({ message: t('upload.sync-failed') });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleKbFilesSelected = async (
    selected: {
      id: string;
      name: string;
      size: number;
      type: string;
    }[],
  ) => {
    if (!project) {
      return;
    }
    const fileIds = selected.map((f) => f.id);
    await importFilesToProject(fileIds, project.id);
    loadFiles(project.id);
  };

  const handleExternalFileSelected = async (doc: {
    name: string;
    content: string;
    type: string;
    driveFileId?: string;
    driveModifiedTime?: string;
  }) => {
    if (!project) {
      return;
    }
    try {
      // If it's a Drive file, use the proper import (with metadata for sync)
      if (doc.driveFileId) {
        const result = await importDriveFileToProject(
          doc.driveFileId,
          doc.name,
          doc.driveModifiedTime || '',
          project.id,
        );
        if (!result.success) {
          errorToast({ message: result.error || t('file-upload-fail') });
          return;
        }
        successToast({ message: t('file-uploaded') });
        loadFiles(project.id);
        return;
      }

      // Non-Drive files: upload via FormData
      const blob = new Blob([doc.content], { type: 'text/markdown' });
      const fileName = doc.name.endsWith('.md') ? doc.name : `${doc.name}.md`;
      const file = new File([blob], fileName, { type: 'text/markdown' });

      const { uploadProjectFiles } = await import('@/app/lib/services/api');
      const formData = new FormData();
      formData.append('files', file);
      formData.append('projectId', project.id);

      await uploadProjectFiles(project.id, formData);
      successToast({ message: t('file-uploaded') });
      loadFiles(project.id);
    } catch {
      errorToast({ message: t('file-upload-fail') });
    }
  };

  const toggleFileSelect = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map((f) => f.id)));
    }
  };

  const clearSelection = () => {
    setSelectedFileIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (!project || selectedFileIds.size === 0 || isDeletingSelected) {
      return;
    }
    setIsDeletingSelected(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selectedFileIds).map((fileId) =>
          deleteProjectFileAction(fileId, project.id),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        errorToast({ message: t('file-delete-fail') });
      } else {
        infoToast({ message: t('file-deleted') });
      }
      setSelectedFileIds(new Set());
      loadFiles(project.id);
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const handleFileInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!project) {
      return;
    }
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    const { uploadProjectFiles } = await import('@/app/lib/services/api');
    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));
    formData.append('projectId', project.id);

    try {
      await uploadProjectFiles(project.id, formData);
      successToast({ message: t('file-uploaded') });
      loadFiles(project.id);
    } catch {
      errorToast({ message: t('file-upload-fail') });
    }

    if (event.target) {
      event.target.value = '';
    }
  };

  const handleProjectFilesDrop = useCallback(
    async (files: File[]) => {
      if (!project || files.length === 0) {
        return;
      }

      const { uploadProjectFiles } = await import('@/app/lib/services/api');
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('projectId', project.id);

      try {
        await uploadProjectFiles(project.id, formData);
        successToast({ message: t('file-uploaded') });
        loadFiles(project.id);
      } catch {
        errorToast({ message: t('file-upload-fail') });
      }
    },
    [project, successToast, errorToast, t, loadFiles],
  );

  if (isLoading || !project || !isReady) {
    return (
      <div className="animate-pulse">
        {/* Back link */}
        <div className="h-4 w-32 bg-muted rounded mb-2" />
        {/* Title */}
        <div className="h-8 w-48 bg-muted rounded mb-4" />
        <div className="flex gap-6 w-full">
          {/* Left column */}
          <div className="flex-1 min-w-0">
            <div className="h-[100px] w-full bg-muted rounded-xl mb-6" />
            <div className="space-y-3">
              <div className="h-12 w-full bg-muted rounded" />
              <div className="h-12 w-full bg-muted rounded" />
              <div className="h-12 w-full bg-muted rounded" />
            </div>
          </div>
          {/* Right column */}
          <div className="w-80 lg:w-96 shrink-0 hidden md:block space-y-4">
            <div className="h-20 w-full bg-muted rounded-xl" />
            <div className="h-40 w-full bg-muted rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Back link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        <ArrowLeftIcon className="size-3.5" />
        {t('project-view.all-projects')}
      </Link>

      {/* Project title + actions */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
        <ShareDialogTrigger
          publishedAt={project.publishedAt ?? ''}
          accessToken={project.accessToken ?? ''}
          projectId={project.id}
          isPublicProject={project.isPublic}
        />
      </div>

      <div className="flex items-start gap-6 w-full">
        {/* Left column: chat input, thread list */}
        <div className="flex-1 min-w-0">
          {/* Chat input */}
          <div className="mb-6">
            <NewChatInterface
              projectId={project.id}
              projectTitle={project.title}
              className="!max-w-none !mx-0 !px-0"
              onProjectFilesDrop={handleProjectFilesDrop}
            />
          </div>

          {/* Thread tabs + list */}
          {(() => {
            const myThreads = project.threads.filter(
              (thread) => thread.source === 'UI',
            );
            const publicThreads = project.threads.filter(
              (thread) =>
                thread.source === 'PUBLIC' || thread.source === 'CHATBOT',
            );
            const apiThreads = project.threads.filter(
              (thread) => thread.source === 'API',
            );
            const threadsByTab = {
              my: myThreads,
              public: publicThreads,
              api: apiThreads,
            };
            const activeThreads = threadsByTab[threadTab];
            const showTabs = publicThreads.length > 0 || apiThreads.length > 0;

            return (
              <>
                {/* Tabs — hidden when only UI threads exist */}
                {showTabs && (
                  <div className="flex gap-1 mb-4 border-b border-border">
                    <button
                      type="button"
                      onClick={() => setThreadTab('my')}
                      className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                        threadTab === 'my'
                          ? 'border-foreground text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('project-view.my-threads')} ({myThreads.length})
                    </button>
                    {publicThreads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setThreadTab('public')}
                        className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                          threadTab === 'public'
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t('project-view.public-threads')} (
                        {publicThreads.length})
                      </button>
                    )}
                    {apiThreads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setThreadTab('api')}
                        className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                          threadTab === 'api'
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t('project-view.api-threads')} ({apiThreads.length})
                      </button>
                    )}
                  </div>
                )}

                {/* Thread list */}
                {activeThreads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ChatBubbleLeftIcon className="size-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {t('project-view.no-threads')}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {t('project-view.no-threads-description')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {activeThreads.map((thread) => {
                      const isPublic =
                        thread.source === 'PUBLIC' ||
                        thread.source === 'CHATBOT';
                      const isApi = thread.source === 'API';
                      const href =
                        isPublic && thread.visitorId
                          ? `/chats/${thread.id}/read-only?vid=${thread.visitorId}`
                          : `/chats/${thread.id}`;

                      return (
                        <Link
                          key={thread.id}
                          href={href}
                          className="flex items-center gap-3 px-3 py-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors group border-b border-border/30 last:border-b-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isPublic && (
                                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                                  {t('project-view.guest')}
                                </span>
                              )}
                              {isApi && (
                                <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                                  API
                                </span>
                              )}
                              <p className="text-sm font-medium truncate group-hover:text-foreground">
                                {getThreadTitle(
                                  thread,
                                  t('project-view.new-conversation'),
                                )}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground/60 mt-0.5">
                              {t('project-view.last-message', {
                                time: formatRelativeTime(
                                  thread.createdAt,
                                  locale,
                                ),
                              })}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Right column: instructions + files */}
        <div className="w-80 lg:w-96 shrink-0 hidden md:block space-y-4 mt-2">
          {/* Instructions section — hidden for template-based projects */}
          {project.templateId ? (
            <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/30 dark:bg-indigo-950/10 p-4">
              <div className="flex items-center gap-2">
                {project.template?.iconUrl ? (
                  <img
                    src={project.template.iconUrl}
                    alt=""
                    className="size-5 rounded object-cover"
                  />
                ) : (
                  <BookOpenIcon className="size-4 text-indigo-500" />
                )}
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {t('project-view.powered-by', {
                    name: project.template?.name ?? '',
                  })}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border border-border/40 bg-muted/20 p-4 hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => setShowInstructions(true)}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold">
                  {t('project-view.instructions')}
                </h3>
                <PlusIcon className="size-4 text-muted-foreground" />
              </div>
              {instructionText ? (
                <p className="text-sm text-muted-foreground/70 line-clamp-2 whitespace-pre-line">
                  {instructionText}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('project-instructions.description')}
                </p>
              )}
            </div>
          )}

          {/* Files section - inline */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">
                {t('project-view.files')}
              </h3>
              <div className="flex items-center gap-1">
                {hasDriveFiles && (
                  <div className="relative group/sync">
                    <button
                      onClick={handleSyncDrive}
                      disabled={isSyncing}
                      className="p-1 rounded hover:bg-muted/50 transition-colors disabled:opacity-50"
                      title={tAttach('sync-google-drive')}
                    >
                      <ArrowPathIcon
                        className={`size-4 text-muted-foreground ${isSyncing ? 'animate-spin' : ''}`}
                      />
                    </button>
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 text-xs text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg opacity-0 pointer-events-none group-hover/sync:opacity-100 transition-opacity z-10">
                      {t('upload.sync-hint', {
                        defaultMessage:
                          'Re-sync files from connected Google Drive folders. Updates modified files and imports new ones.',
                      })}
                    </div>
                  </div>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-0.5 rounded hover:bg-muted/50 transition-colors">
                      <PlusIcon className="size-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 p-2">
                    <DropdownMenuItem
                      className="py-2.5"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ArrowUpTrayIcon className="size-4" />
                      {tAttach('upload-file')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="py-2.5"
                      onClick={() => setIsKbPickerOpen(true)}
                    >
                      <BookOpenIcon className="size-4" />
                      {tAttach('from-knowledge-base')}
                    </DropdownMenuItem>
                    {hasDriveConnector && (
                      <DropdownMenuItem
                        className="py-2.5"
                        onClick={() => setIsDrivePickerOpen(true)}
                      >
                        <img
                          src="/assets/connectors/google-drive.svg"
                          alt="Google Drive"
                          className="size-4"
                        />
                        {tAttach('from-google-drive')}
                      </DropdownMenuItem>
                    )}
                    {hasFirefliesConnector && (
                      <DropdownMenuItem
                        className="py-2.5"
                        onClick={() => setIsFirefliesPickerOpen(true)}
                      >
                        <img
                          src="/assets/connectors/fireflies.svg"
                          alt="Fireflies"
                          className="size-4"
                        />
                        {tAttach('from-fireflies')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".md,.epub,.srt,.pdf"
                multiple
                onChange={handleFileInputChange}
              />
            </div>

            {/* Capacity bar */}
            <StorageProgressBar
              usedBytes={storageUsed}
              limitBytes={storageLimit}
              className="mb-3"
              label={t('project-view.storage-used', {
                percentage:
                  storageLimit > 0
                    ? Math.round((storageUsed / storageLimit) * 100)
                    : 0,
              })}
            />

            {/* Selection toolbar */}
            {selectedFileIds.size > 0 && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <button onClick={toggleSelectAll}>
                  <Checkbox
                    checked={selectedFileIds.size === files.length}
                    indeterminate={
                      selectedFileIds.size > 0 &&
                      selectedFileIds.size < files.length
                    }
                  />
                </button>
                <span className="text-xs text-muted-foreground">
                  {selectedFileIds.size} {t('project-view.selected')}
                </span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={isDeletingSelected}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  title={t('upload.remove-file')}
                >
                  {isDeletingSelected ? (
                    <div className="size-4 border-t-2 border-current rounded-full animate-spin" />
                  ) : (
                    <TrashIcon className="size-4" />
                  )}
                </button>
                <button
                  onClick={clearSelection}
                  className="ml-auto p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <XMarkIcon className="size-4" />
                </button>
              </div>
            )}

            {/* File cards grid */}
            {files.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto">
                {files.map((file) => (
                  <InlineFileCard
                    key={file.id}
                    file={file}
                    selected={selectedFileIds.has(file.id)}
                    selectionMode={selectedFileIds.size > 0}
                    onToggleSelect={toggleFileSelect}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('no-files')}</p>
            )}
          </div>

          {/* MCP connectors section */}
          {project && <ProjectMcpProviders projectId={project.id} />}
        </div>
      </div>

      <KnowledgeBasePickerDialog
        open={isKbPickerOpen}
        onOpenChange={setIsKbPickerOpen}
        onFilesSelected={handleKbFilesSelected}
      />

      <GoogleDrivePickerDialog
        open={isDrivePickerOpen}
        onOpenChange={setIsDrivePickerOpen}
        onFileSelected={handleExternalFileSelected}
      />

      <FirefliesPickerDialog
        open={isFirefliesPickerOpen}
        onOpenChange={setIsFirefliesPickerOpen}
        onFileSelected={handleExternalFileSelected}
      />

      {/* Instructions dialog */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('project-instructions.title')}</DialogTitle>
          </DialogHeader>
          <ProjectInstructionForm
            projectId={project.id}
            onSuccess={() => {
              setShowInstructions(false);
              getProjectInstructionAction(project.id).then((result) => {
                setInstructionText(result.success ? result.instruction : null);
              });
            }}
            onCancel={() => setShowInstructions(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
