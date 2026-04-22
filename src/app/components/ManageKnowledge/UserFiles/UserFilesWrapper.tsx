'use client';

import { useTranslations } from 'next-intl';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  FolderPlusIcon,
  ArrowUpTrayIcon,
  PlusIcon,
  ComputerDesktopIcon,
  DocumentPlusIcon,
  GlobeAltIcon,
  SparklesIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { deleteFileAction } from '@/app/actions';
import { uploadFiles as uploadFilesApi } from '@/app/lib/services/api';
import { statusToast } from '@/app/lib/utils/toast';
import { useSettings } from '@/app/hooks/useSettings';
import { useUser, useOrganization } from '@/app/hooks/use-auth';
import { CreateFolderDialog } from '../Folders/CreateFolderDialog';
import { AddFromUrlDialog } from '../AddFromUrl/AddFromUrlDialog';
import { getTeams } from '@/app/actions/teams';
import { getOrgMembersAndTeams } from '@/app/actions/permissions';
import {
  bulkDeleteFilesAction,
  bulkReembedFilesAction,
} from '@/app/actions/bulk-documents';
import { useRouter } from '@/i18n/routing';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@ragenai/tui/dropdown';
import { EmptyState } from '@ragenai/tui/empty-state';

import { DocumentsTableSkeleton } from './FileList/DocumentsTableSkeleton';
import { DocumentsGridSkeleton } from './Grid/DocumentsGridSkeleton';
import { FileListView } from './FileList/FileListView';
import { FileSearch } from './FileSearch';
import { GridView } from './Grid/GridView';
import { LayoutToggle, getSavedViewMode } from './LayoutToggle';
import { useBulkSelection } from './hooks/useBulkSelection';
import { BulkActionBar } from './BulkActionBar';
import {
  BulkProgressBanner,
  type BulkProgressState,
} from './BulkProgressBanner';
import { ConfirmBulkDeleteDialog } from './ConfirmBulkDeleteDialog';
import { MoveDialog } from '../MoveDialog';
import { ShareDialog } from '../ShareDialog';
import { DocumentPreviewSlideOver } from '../DocumentPreview/DocumentPreviewSlideOver';
import type { UserFileTypeSafe } from './FileList/UserFilesTable';

import { type UserFile } from '@/generated/prisma/browser';
import type { TeamListItem } from '@/features/teams/contracts/team.types';

const BULK_PROGRESS_THRESHOLD = 10;

export type ModalStateProps = {
  isOpen: boolean;
  fileId: UserFile['id'] | null;
};

type FileListWrapperProps = {
  topBarLeft?: React.ReactNode;
};

export const FileListWrapper = ({ topBarLeft }: FileListWrapperProps) => {
  const { successToast, errorToast, warningToast } = statusToast();
  const tSuccess = useTranslations('success-toast');
  const tError = useTranslations('error-toast');
  const tFolders = useTranslations('folders');
  const tBulk = useTranslations('bulk-notifications');
  const { user } = useUser();
  const { isOrgAdmin } = useOrganization();
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid'>('list');
  const [searchValue, setSearchValue] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showModal, setShowModal] = useState<ModalStateProps>({
    isOpen: false,
    fileId: null,
  });
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isAddFromUrlOpen, setIsAddFromUrlOpen] = useState(false);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Bulk selection
  const bulk = useBulkSelection();
  const [bulkProgress, setBulkProgress] = useState<BulkProgressState>({
    status: 'idle',
  });
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
  const [isBulkShareOpen, setIsBulkShareOpen] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<UserFileTypeSafe | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [singleMoveFileId, setSingleMoveFileId] = useState<string | null>(null);
  const [singleMoveFileName, setSingleMoveFileName] = useState<string>('');
  const [singleShareFileId, setSingleShareFileId] = useState<string | null>(
    null,
  );
  const [singleShareFileName, setSingleShareFileName] = useState<string>('');
  const [orgMembers, setOrgMembers] = useState<
    { id: string; name: string | null; email: string }[]
  >([]);
  const [orgTeams, setOrgTeams] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const saved = getSavedViewMode();
    if (saved !== 'list') {
      setLayoutMode(saved);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !previewFile) {
        toggleModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewFile]);

  useEffect(() => {
    getTeams()
      .then(setTeams)
      .catch(() => {});
  }, []);

  useEffect(() => {
    getOrgMembersAndTeams()
      .then(({ members, teams: t }) => {
        setOrgMembers(members);
        setOrgTeams(t);
      })
      // members list is non-critical — share dialog still works, just won't pre-populate suggestions
      .catch(() => {});
  }, []);

  const { refreshSettings } = useSettings();

  const toggleModal = (fileId: UserFile['id'] | null = null) => {
    setShowModal((prevState) => ({
      ...prevState,
      isOpen: !prevState.isOpen,
      fileId: prevState.isOpen ? null : fileId,
    }));
  };

  const {
    files,
    subfolders,
    isLoading,
    isError,
    addFile,
    removeFile,
    setFolder,
    currentFolderId,
    refreshFiles,
    viewMode,
    hasLoadedOnce,
  } = useUserFilesContext();

  const isSharedView = viewMode === 'shared-with-me';

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value.trim());
  };

  const defaultProjectFiles = useMemo(() => {
    return files.filter((file) =>
      file.fileName.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [files, searchValue]);

  const handlePreviewFile = (file: UserFileTypeSafe) => {
    const idx = defaultProjectFiles.findIndex((f) => f.id === file.id);
    setPreviewFile(file);
    setPreviewIndex(idx >= 0 ? idx : 0);
  };

  const handleDelete = async (
    fileId: UserFile['id'],
    fileName: UserFile['fileName'],
  ) => {
    try {
      setDeleteLoading(true);
      const { status } = await deleteFileAction(fileId);

      if (status === 200) {
        removeFile(fileId);
        refreshSettings();
        successToast({ message: `${tSuccess('deleted')}: ${fileName}` });
      }
    } catch {
      errorToast({ message: tError('error-during-deleting-file') });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Reconcile bulk selection whenever the visible file list changes (folder/view/search).
  // Drops any selected IDs that are no longer in the current view.
  useEffect(() => {
    const visibleIds = defaultProjectFiles.map((f) => f.id);
    bulk.retainOnly(visibleIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, viewMode, defaultProjectFiles]);

  const fileIds = useMemo(
    () => Array.from(bulk.selectedIds),
    [bulk.selectedIds],
  );

  const handleBulkDelete = async () => {
    setIsBulkDeleteOpen(false);
    setIsBulkLoading(true);
    const count = fileIds.length;
    if (count >= BULK_PROGRESS_THRESHOLD) {
      setBulkProgress({
        status: 'running',
        total: count,
        operation: 'delete',
      });
    }
    try {
      const result = await bulkDeleteFilesAction(fileIds);
      result.succeeded.forEach((id) => removeFile(id));
      if (result.succeeded.length > 0) {
        refreshSettings();
      }
      if (count >= BULK_PROGRESS_THRESHOLD) {
        setBulkProgress({
          status: 'done',
          succeeded: result.succeeded.length,
          failed: result.failed.length,
          operation: 'delete',
        });
      } else if (result.failed.length > 0) {
        warningToast({
          message: tBulk('deleted-partial', {
            succeeded: result.succeeded.length,
            total: count,
          }),
        });
      } else {
        successToast({
          message: tBulk('deleted-all', { count: result.succeeded.length }),
        });
      }
      bulk.clearAll();
    } catch {
      errorToast({ message: tError('error-during-deleting-file') });
      if (count >= BULK_PROGRESS_THRESHOLD) {
        setBulkProgress({ status: 'idle' });
      }
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkMoved = (
    succeeded: string[],
    failed: { fileId: string; fileName: string; error: string }[],
  ) => {
    const count = succeeded.length + failed.length;
    if (count >= BULK_PROGRESS_THRESHOLD) {
      setBulkProgress({
        status: 'done',
        succeeded: succeeded.length,
        failed: failed.length,
        operation: 'move',
      });
    } else if (failed.length > 0) {
      warningToast({
        message: tBulk('moved-partial', {
          succeeded: succeeded.length,
          total: count,
        }),
      });
    } else {
      successToast({
        message: tBulk('moved-all', { count: succeeded.length }),
      });
    }
    bulk.clearAll();
    refreshFiles();
  };

  const handleBulkShared = (
    succeeded: string[],
    failed: { fileId: string; fileName: string; error: string }[],
  ) => {
    const count = succeeded.length + failed.length;
    if (failed.length > 0) {
      warningToast({
        message: tBulk('shared-partial', {
          succeeded: succeeded.length,
          total: count,
        }),
      });
    } else {
      successToast({
        message: tBulk('shared-all', { count: succeeded.length }),
      });
    }
    bulk.clearAll();
  };

  const handleBulkReembed = async () => {
    setIsBulkLoading(true);
    const count = fileIds.length;
    if (count >= BULK_PROGRESS_THRESHOLD) {
      setBulkProgress({
        status: 'running',
        total: count,
        operation: 'reembed',
      });
    }
    try {
      const result = await bulkReembedFilesAction(fileIds);
      if (count >= BULK_PROGRESS_THRESHOLD) {
        setBulkProgress({
          status: 'done',
          succeeded: result.succeeded.length,
          failed: result.failed.length,
          operation: 'reembed',
        });
      } else if (result.failed.length > 0) {
        warningToast({
          message: tBulk('reembedded-partial', {
            succeeded: result.succeeded.length,
            total: count,
          }),
        });
      } else {
        successToast({
          message: tBulk('reembedded-all', { count: result.succeeded.length }),
        });
      }
      bulk.clearAll();
      refreshFiles();
    } catch {
      errorToast({ message: tBulk('reembed-error') });
      if (count >= BULK_PROGRESS_THRESHOLD) {
        setBulkProgress({ status: 'idle' });
      }
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleUploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const filesArray = Array.from(fileList).map((file) => {
        // Ensure correct MIME types for .md and .srt files
        if (file.name.endsWith('.md')) {
          return new File([file], file.name, { type: 'text/markdown' });
        }
        if (file.name.endsWith('.srt')) {
          return new File([file], file.name, { type: 'application/x-subrip' });
        }
        return file;
      });
      if (filesArray.length === 0) {
        return;
      }

      try {
        const formData = new FormData();
        filesArray.forEach((file) => formData.append('files', file));
        if (currentFolderId) {
          formData.append('folderId', String(currentFolderId));
        }
        const response = await uploadFilesApi(formData);
        if (response.status === 200) {
          successToast({
            message: tSuccess('files-uploaded', {
              count: response.files?.length ?? filesArray.length,
            }),
          });
          refreshFiles();
          refreshSettings();
        } else {
          errorToast({ message: response.message || 'Upload failed' });
        }
      } catch (err) {
        errorToast({
          message: err instanceof Error ? err.message : 'Error uploading files',
        });
      }
    },
    [currentFolderId, refreshFiles, refreshSettings, successToast, errorToast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleUploadFiles(e.dataTransfer.files);
      }
    },
    [handleUploadFiles],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  if (!user) {
    return null;
  }

  const hasContent = defaultProjectFiles.length > 0 || subfolders.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar: breadcrumbs */}
      {topBarLeft && <div className="mb-2 shrink-0">{topBarLeft}</div>}

      {/* Action bar: search + toggle on left, buttons on right */}
      <div className="mb-3 flex shrink-0 items-center gap-3">
        <FileSearch value={searchValue} onChange={handleSearchChange} />
        <LayoutToggle
          className="hidden md:flex"
          viewMode={layoutMode}
          onViewModeChange={setLayoutMode}
        />
        <div className="flex-1" />
        {/* Action buttons — right side (hidden in shared-with-me view) */}
        {!isSharedView && (
          <>
            <button
              onClick={() => setIsCreateFolderOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <FolderPlusIcon className="size-4" />
              {tFolders('new')}
            </button>
            <Dropdown>
              <DropdownButton
                color="violet"
                className="inline-flex items-center gap-2"
              >
                {tFolders('add-document')}
                <ChevronDownIcon className="size-3.5 ml-0.5 opacity-70" />
              </DropdownButton>
              <DropdownMenu
                anchor="bottom end"
                className="[&_[data-slot=icon]]:mr-2"
              >
                <DropdownItem onClick={() => fileInputRef.current?.click()}>
                  <ComputerDesktopIcon className="size-4" data-slot="icon" />
                  {tFolders('from-disk')}
                </DropdownItem>
                <DropdownItem
                  onClick={() => router.push('/knowledge/create-document')}
                >
                  <DocumentPlusIcon className="size-4" data-slot="icon" />
                  {tFolders('create-document')}
                </DropdownItem>
                <DropdownItem onClick={() => setIsAddFromUrlOpen(true)}>
                  <GlobeAltIcon className="size-4" data-slot="icon" />
                  {tFolders('add-from-url')}
                </DropdownItem>
                <DropdownItem
                  onClick={() => router.push('/knowledge/optimize-document')}
                >
                  <SparklesIcon className="size-4" data-slot="icon" />
                  {tFolders('optimize-document')}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
          </>
        )}
      </div>

      <BulkProgressBanner
        state={bulkProgress}
        onDismiss={() => setBulkProgress({ status: 'idle' })}
      />

      {/* Content area with drag & drop (disabled in shared-with-me view) */}
      <div
        className={`min-h-0 flex-1 overflow-y-auto rounded-lg border-2 border-dashed transition-colors ${
          isDragOver && !isSharedView
            ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-600'
            : 'border-transparent'
        }`}
        onDrop={isSharedView ? undefined : handleDrop}
        onDragOver={isSharedView ? undefined : handleDragOver}
        onDragLeave={isSharedView ? undefined : handleDragLeave}
      >
        {(() => {
          if (isLoading && !hasLoadedOnce) {
            return layoutMode === 'grid' ? (
              <DocumentsGridSkeleton />
            ) : (
              <DocumentsTableSkeleton />
            );
          }

          if (isLoading && hasLoadedOnce) {
            return (
              <div className="flex items-center justify-center py-16">
                <div className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
              </div>
            );
          }
          if (!hasContent && !isError) {
            if (isSharedView) {
              return (
                <EmptyState
                  title={tFolders('no-shared-files')}
                  className="py-20"
                />
              );
            }
            return (
              <EmptyState
                icon={
                  <ArrowUpTrayIcon className="size-10 text-gray-300 dark:text-gray-600" />
                }
                title={tFolders(
                  currentFolderId ? 'no-documents-in-folder' : 'no-documents',
                )}
                description={tFolders('drag-drop')}
                actions={[
                  {
                    label: tFolders('upload-cta'),
                    onClick: () => fileInputRef.current?.click(),
                  },
                  {
                    label: tFolders('create-document'),
                    onClick: () => router.push('/knowledge/create-document'),
                  },
                  {
                    label: tFolders('add-from-url'),
                    onClick: () => setIsAddFromUrlOpen(true),
                  },
                ]}
                className="py-20"
              />
            );
          }
          if (layoutMode === 'list') {
            return (
              <FileListView
                isError={isError}
                deleteLoading={deleteLoading}
                isLoading={false}
                addFile={addFile}
                removeFile={removeFile}
                files={defaultProjectFiles}
                subfolders={subfolders}
                onNavigateFolder={setFolder}
                showModal={showModal}
                toggleModal={toggleModal}
                handleDelete={handleDelete}
                isSelected={bulk.isSelected}
                isAllSelected={bulk.isAllSelected}
                isIndeterminate={bulk.isIndeterminate}
                onToggleFile={bulk.toggleFile}
                onToggleAll={bulk.toggleAll}
                onUpload={
                  !isSharedView
                    ? () => fileInputRef.current?.click()
                    : undefined
                }
                onCreateDocument={
                  !isSharedView
                    ? () => router.push('/knowledge/create-document')
                    : undefined
                }
                onAddFromUrl={
                  !isSharedView ? () => setIsAddFromUrlOpen(true) : undefined
                }
                onPreviewFile={handlePreviewFile}
              />
            );
          }
          return (
            <GridView
              deleteLoading={deleteLoading}
              isError={isError}
              isLoading={false}
              addFile={addFile}
              showModal={showModal}
              removeFile={removeFile}
              files={defaultProjectFiles}
              subfolders={subfolders}
              onNavigateFolder={setFolder}
              toggleModal={toggleModal}
              handleDelete={handleDelete}
              isSelected={bulk.isSelected}
              isAllSelected={bulk.isAllSelected}
              isIndeterminate={bulk.isIndeterminate}
              onToggleFile={bulk.toggleFile}
              onToggleAll={bulk.toggleAll}
              onUpload={
                !isSharedView ? () => fileInputRef.current?.click() : undefined
              }
              onCreateDocument={
                !isSharedView
                  ? () => router.push('/knowledge/create-document')
                  : undefined
              }
              onAddFromUrl={
                !isSharedView ? () => setIsAddFromUrlOpen(true) : undefined
              }
              onPreviewFile={handlePreviewFile}
              onMove={(fileId) => {
                const f = defaultProjectFiles.find((x) => x.id === fileId);
                setSingleMoveFileId(fileId);
                setSingleMoveFileName(f?.fileName ?? '');
              }}
              onShare={(fileId) => {
                const f = defaultProjectFiles.find((x) => x.id === fileId);
                setSingleShareFileId(fileId);
                setSingleShareFileName(f?.fileName ?? '');
              }}
            />
          );
        })()}
      </div>

      <DocumentPreviewSlideOver
        file={previewFile}
        files={defaultProjectFiles as UserFileTypeSafe[]}
        initialIndex={previewIndex}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        onFileChange={(f, i) => {
          setPreviewFile(f);
          setPreviewIndex(i);
        }}
        onDelete={(fileId) => {
          toggleModal(fileId);
          setPreviewFile(null);
        }}
        onShare={(fileId) => {
          const f = defaultProjectFiles.find((x) => x.id === fileId);
          setPreviewFile(null);
          setSingleShareFileId(fileId);
          setSingleShareFileName(f?.fileName ?? '');
        }}
        onMove={(fileId) => {
          const f = defaultProjectFiles.find((x) => x.id === fileId);
          setPreviewFile(null);
          setSingleMoveFileId(fileId);
          setSingleMoveFileName(f?.fileName ?? '');
        }}
      />

      <CreateFolderDialog
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        onCreated={() => {
          setIsCreateFolderOpen(false);
          refreshFiles();
        }}
        parentId={currentFolderId}
      />

      <AddFromUrlDialog
        isOpen={isAddFromUrlOpen}
        onClose={() => setIsAddFromUrlOpen(false)}
        onSuccess={() => {
          setIsAddFromUrlOpen(false);
          refreshFiles();
        }}
      />

      <BulkActionBar
        selectedCount={bulk.selectedCount}
        onClear={bulk.clearAll}
        onDelete={() => setIsBulkDeleteOpen(true)}
        onMove={() => setIsBulkMoveOpen(true)}
        onShare={() => setIsBulkShareOpen(true)}
        onReembed={handleBulkReembed}
        isLoading={isBulkLoading}
      />

      <ConfirmBulkDeleteDialog
        isOpen={isBulkDeleteOpen}
        isLoading={isBulkLoading}
        count={bulk.selectedCount}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
      />

      <MoveDialog
        mode="bulk"
        isOpen={isBulkMoveOpen}
        onClose={() => setIsBulkMoveOpen(false)}
        fileIds={fileIds}
        onMoved={handleBulkMoved}
      />

      {singleMoveFileId && (
        <MoveDialog
          mode="single"
          resourceType="file"
          resourceId={singleMoveFileId}
          resourceName={singleMoveFileName}
          isOpen={!!singleMoveFileId}
          onClose={() => setSingleMoveFileId(null)}
          onMoved={() => {
            setSingleMoveFileId(null);
            refreshFiles();
          }}
        />
      )}

      <ShareDialog
        mode="bulk"
        isOpen={isBulkShareOpen}
        onClose={() => setIsBulkShareOpen(false)}
        fileIds={fileIds}
        orgMembers={orgMembers}
        orgTeams={orgTeams}
        onShared={handleBulkShared}
      />

      {singleShareFileId && (
        <ShareDialog
          mode="single"
          resourceType="file"
          resourceId={singleShareFileId}
          resourceName={singleShareFileName}
          isOpen={!!singleShareFileId}
          onClose={() => setSingleShareFileId(null)}
          orgMembers={orgMembers}
          orgTeams={orgTeams}
        />
      )}
    </div>
  );
};
