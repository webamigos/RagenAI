'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
  ChatBubbleLeftIcon,
  PlusIcon,
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
import { importFilesToProject } from '@/app/actions';

import type { FileType } from '@/generated/prisma/browser';

type ProjectThread = {
  publicId: string;
  title: string | null;
  createdAt: string;
  isStarred: boolean;
  messages: { content: string }[];
};

type Project = {
  id: number;
  publicId: string;
  title: string;
  isPublic: boolean;
  accessToken: string | null;
  publishedAt: string | null;
  chatbotEnabled: boolean;
  threads: ProjectThread[];
};

type ProjectFile = {
  publicId: string;
  fileName: string;
  fileSize: number;
  fileType: FileType;
  createdAt: Date | null;
  metadata?: Record<string, unknown> | null;
};

type Props = {
  projectId: string;
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}

function getThreadTitle(thread: ProjectThread): string {
  if (thread.title) {
    return thread.title;
  }
  if (thread.messages.length > 0) {
    const content = thread.messages[0].content;
    return content.length > 60 ? content.slice(0, 60) + '...' : content;
  }
  return 'New conversation';
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
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);
  const [isKbPickerOpen, setIsKbPickerOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isFirefliesPickerOpen, setIsFirefliesPickerOpen] = useState(false);
  const [hasDriveConnector, setHasDriveConnector] = useState(false);
  const [hasFirefliesConnector, setHasFirefliesConnector] = useState(false);
  const [hasDriveFiles, setHasDriveFiles] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { errorToast, successToast, infoToast } = statusToast();
  const t = useTranslations('projects');
  const tAttach = useTranslations('prompt-attachments');

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

  useEffect(() => {
    async function loadProject() {
      try {
        const projectData = await fetchProject(projectId);
        setProject(projectData);
        loadFiles(projectData.publicId);
        getProjectInstructionAction(projectData.publicId).then((result) => {
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
      const result = await syncDriveProject(project.publicId);
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
      loadFiles(project.publicId);
    } catch {
      errorToast({ message: t('upload.sync-failed') });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleKbFilesSelected = async (
    selected: {
      publicId: string;
      name: string;
      size: number;
      type: string;
    }[],
  ) => {
    if (!project) {
      return;
    }
    const fileIds = selected.map((f) => f.publicId);
    await importFilesToProject(fileIds, project.publicId);
    loadFiles(project.publicId);
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
          project.publicId,
        );
        if (!result.success) {
          errorToast({ message: result.error || t('file-upload-fail') });
          return;
        }
        successToast({ message: t('file-uploaded') });
        loadFiles(project.publicId);
        return;
      }

      // Non-Drive files: upload via FormData
      const blob = new Blob([doc.content], { type: 'text/markdown' });
      const fileName = doc.name.endsWith('.md') ? doc.name : `${doc.name}.md`;
      const file = new File([blob], fileName, { type: 'text/markdown' });

      const { uploadProjectFiles } = await import('@/app/lib/services/api');
      const formData = new FormData();
      formData.append('files', file);
      formData.append('projectId', project.publicId);

      await uploadProjectFiles(project.publicId, formData);
      successToast({ message: t('file-uploaded') });
      loadFiles(project.publicId);
    } catch {
      errorToast({ message: t('file-upload-fail') });
    }
  };

  const handleRemoveFile = async (publicFileId: string) => {
    if (!project || removingFileId) {
      return;
    }
    setRemovingFileId(publicFileId);
    try {
      const result = await deleteProjectFileAction(
        publicFileId,
        project.publicId,
      );
      if (result.error) {
        throw new Error(result.error);
      }
      infoToast({ message: t('file-deleted') });
      loadFiles(project.publicId);
    } catch {
      errorToast({ message: t('file-delete-fail') });
    } finally {
      setRemovingFileId(null);
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
    formData.append('projectId', project.publicId);

    try {
      await uploadProjectFiles(project.publicId, formData);
      successToast({ message: t('file-uploaded') });
      loadFiles(project.publicId);
    } catch {
      errorToast({ message: t('file-upload-fail') });
    }

    if (event.target) {
      event.target.value = '';
    }
  };

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
          projectPublicId={project.publicId}
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
              projectPublicId={project.publicId}
              projectTitle={project.title}
              className="!max-w-none !mx-0 !px-0"
            />
          </div>

          {/* Thread list */}
          {project.threads.length === 0 ? (
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
              {project.threads.map((thread) => (
                <Link
                  key={thread.publicId}
                  href={`/chats/${thread.publicId}`}
                  className="flex items-center gap-3 px-3 py-3 -mx-3 rounded-lg hover:bg-muted/50 transition-colors group border-b border-border/30 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-foreground">
                      {getThreadTitle(thread)}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      Last message {formatRelativeTime(thread.createdAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column: instructions + files */}
        <div className="w-80 lg:w-96 shrink-0 hidden md:block space-y-4 mt-2">
          {/* Instructions section */}
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

            {/* File cards grid */}
            {files.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {files.map((file) => (
                  <InlineFileCard
                    key={file.publicId}
                    file={file}
                    onRemove={handleRemoveFile}
                    isRemoving={removingFileId === file.publicId}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('no-files')}</p>
            )}
          </div>
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
        <DialogContent className="max-w-lg max-h-[600px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('project-instructions.title')}</DialogTitle>
          </DialogHeader>
          <ProjectInstructionForm
            projectId={project.publicId}
            onSuccess={() => {
              setShowInstructions(false);
              getProjectInstructionAction(project.publicId).then((result) => {
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
