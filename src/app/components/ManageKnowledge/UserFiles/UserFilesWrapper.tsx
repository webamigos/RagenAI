'use client';

import { useTranslations } from 'next-intl';
import { useState, useMemo, useEffect } from 'react';

import { Card } from '@ragenai/common-ui/Card';
import { useUserFilesContext } from '@/app/hooks/useUserFilesContext';
import { deleteFileAction } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';
import { useSettings } from '@/app/hooks/useSettings';
import { useUser } from '@/app/hooks/use-auth';

import { FileListView } from './FileList/FileListView';
import { FileSearch } from './FileSearch';
import { GridView } from './Grid/GridView';
import { LayoutToggle, getSavedViewMode } from './LayoutToggle';

import { type UserFile } from '@/generated/prisma/browser';

export type ModalStateProps = {
  isOpen: boolean;
  filePublicId: UserFile['publicId'] | null;
};

export const FileListWrapper = () => {
  const { successToast, errorToast } = statusToast();
  const tSuccess = useTranslations('success-toast');
  const tError = useTranslations('error-toast');
  const { user } = useUser();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchValue, setSearchValue] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showModal, setShowModal] = useState<ModalStateProps>({
    isOpen: false,
    filePublicId: null,
  });

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

  const { refreshSettings } = useSettings();

  const toggleModal = (filePublicId: UserFile['publicId'] | null = null) => {
    setShowModal((prevState) => ({
      ...prevState,
      isOpen: !prevState.isOpen,
      filePublicId: prevState.isOpen ? null : filePublicId,
    }));
  };

  // TODO: refactor to files
  const { files, isLoading, isError, addFile, removeFile } =
    useUserFilesContext();

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

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-baseline justify-end gap-3">
        <FileSearch value={searchValue} onChange={handleSearchChange} />
        <LayoutToggle
          className="hidden md:flex"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {viewMode === 'list' ? (
          <Card size="full">
            <FileListView
              isError={isError}
              deleteLoading={deleteLoading}
              isLoading={isLoading}
              addFile={addFile}
              removeFile={removeFile}
              files={defaultProjectFiles}
              showModal={showModal}
              toggleModal={toggleModal}
              handleDelete={handleDelete}
            />
          </Card>
        ) : (
          <GridView
            deleteLoading={deleteLoading}
            isError={isError}
            isLoading={isLoading}
            addFile={addFile}
            showModal={showModal}
            removeFile={removeFile}
            files={defaultProjectFiles}
            toggleModal={toggleModal}
            handleDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
};
