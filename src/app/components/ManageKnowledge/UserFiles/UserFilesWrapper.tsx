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
import { useRouter } from '@/i18n/routing';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
} from '@ragenai/tui/dropdown';

import { FileListView } from './FileList/FileListView';
import { FileSearch } from './FileSearch';
import { GridView } from './Grid/GridView';
import { LayoutToggle, getSavedViewMode } from './LayoutToggle';

import { type UserFile } from '@/generated/prisma/browser';
import type { TeamListItem } from '@/features/teams/contracts/team.types';

export type ModalStateProps = {
  isOpen: boolean;
  filePublicId: UserFile['publicId'] | null;
};

type FileListWrapperProps = {
  topBarLeft?: React.ReactNode;
};

export const FileListWrapper = ({ topBarLeft }: FileListWrapperProps) => {
  const { successToast, errorToast } = statusToast();
  const tSuccess = useTranslations('success-toast');
  const tError = useTranslations('error-toast');
  const tFolders = useTranslations('folders');
  const { user } = useUser();
  const { isOrgAdmin } = useOrganization();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchValue, setSearchValue] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showModal, setShowModal] = useState<ModalStateProps>({
    isOpen: false,
    filePublicId: null,
  });
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isAddFromUrlOpen, setIsAddFromUrlOpen] = useState(false);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      toggleModal(null);
    }
  };

  useEffect(() => {
    const saved = getSavedViewMode();
    if (saved !== 'list') {
      setViewMode(saved);
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    getTeams()
      .then(setTeams)
      .catch(() => {});
  }, []);

  const { refreshSettings } = useSettings();

  const toggleModal = (filePublicId: UserFile['publicId'] | null = null) => {
    setShowModal((prevState) => ({
      ...prevState,
      isOpen: !prevState.isOpen,
      filePublicId: prevState.isOpen ? null : filePublicId,
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

  const handleDelete = async (
    filePublicId: UserFile['publicId'],
    fileName: UserFile['fileName'],
  ) => {
    try {
      setDeleteLoading(true);
      const { status } = await deleteFileAction(filePublicId);

      if (status === 200) {
        removeFile(filePublicId);
        refreshSettings();
        successToast({ message: `${tSuccess('deleted')}: ${fileName}` });
      }
    } catch {
      errorToast({ message: tError('error-during-deleting-file') });
    } finally {
      setDeleteLoading(false);
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
          viewMode={viewMode}
          onViewModeChange={setViewMode}
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
          if (isLoading) {
            return (
              <div className="flex items-center justify-center py-16">
                <div className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
              </div>
            );
          }
          if (!hasContent && !isError) {
            if (isSharedView) {
              return (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {tFolders('no-shared-files')}
                  </p>
                </div>
              );
            }
            return (
              <div
                className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-gray-200 rounded-lg dark:border-gray-700 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600"
                onClick={() => fileInputRef.current?.click()}
              >
                <ArrowUpTrayIcon className="size-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {tFolders('drag-drop')}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {tFolders('or-browse')}
                </p>
              </div>
            );
          }
          if (viewMode === 'list') {
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
              toggleModal={toggleModal}
              handleDelete={handleDelete}
            />
          );
        })()}
      </div>

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
    </div>
  );
};
