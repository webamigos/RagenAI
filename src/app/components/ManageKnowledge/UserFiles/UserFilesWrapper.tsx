import { useTranslations } from 'next-intl';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { Card } from '@ragenai/common-ui/Card';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';
import { deleteDocumentAction } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';
import { useSettings } from '@/app/hooks/useSettings';
import { useUser } from '@clerk/nextjs';

import { FileListView } from './FileList/FileListView';
import { FileSearch } from './FileSearch';
import { GridView } from './Grid/GridView';
import { LayoutToggle } from './LayoutToggle';

export type ModalStateProps = {
  isOpen: boolean;
  fileId: string | null;
};

export const FileListWrapper = () => {
  const t = useTranslations('files-table');
  const { successToast, errorToast } = statusToast();
  const tSuccess = useTranslations('success-toast');
  const tError = useTranslations('error-toast');
  const { user } = useUser();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchValue, setSearchValue] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showModal, setShowModal] = useState<ModalStateProps>({
    isOpen: false,
    fileId: null,
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      toggleModal(null);
    }
  };

  useEffect(() => {
    const savedViewMode = user?.publicMetadata?.viewMode as 'grid' | 'list';
    if (savedViewMode === 'grid' || savedViewMode === 'list') {
      setViewMode(savedViewMode);
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [user]);

  const { refreshSettings } = useSettings();

  const toggleModal = (fileId: string | null = null) => {
    setShowModal((prevState) => ({
      ...prevState,
      isOpen: !prevState.isOpen,
      fileId: prevState.isOpen ? null : fileId,
    }));
  };

  const { prefetch } = useRouter();

  const { documents, isLoading, isError, addDocument, removeDocument } =
    useUserDocumentsContext();

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value.trim());
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) =>
      doc.file_name.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [documents, searchValue]);

  const handlePrefetch = (path: string) => {
    prefetch(path);
  };

  const handleDelete = async (
    organization_id: string,
    documentId: string,
    fileName: string
  ) => {
    try {
      setDeleteLoading(true);
      const { status } = await deleteDocumentAction(
        organization_id,
        documentId
      );

      if (status === 200) {
        removeDocument(documentId);
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
    <Card size="full" className="pt-2">
      <div className="flex items-baseline justify-end gap-3">
        <FileSearch value={searchValue} onChange={handleSearchChange} />
        <LayoutToggle
          clerkUserId={user!.id}
          className="hidden md:flex"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
      {viewMode === 'list' ? (
        <FileListView
          isError={isError}
          deleteLoading={deleteLoading}
          isLoading={isLoading}
          addDocument={addDocument}
          removeDocument={removeDocument}
          documents={filteredDocuments}
          handlePrefetch={handlePrefetch}
          showModal={showModal}
          toggleModal={toggleModal}
          handleDelete={handleDelete}
        />
      ) : (
        <GridView
          deleteLoading={deleteLoading}
          isError={isError}
          isLoading={isLoading}
          addDocument={addDocument}
          showModal={showModal}
          removeDocument={removeDocument}
          documents={filteredDocuments}
          handlePrefetch={handlePrefetch}
          toggleModal={toggleModal}
          handleDelete={handleDelete}
        />
      )}
    </Card>
  );
};
