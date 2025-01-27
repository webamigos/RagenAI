import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';

import { Card } from '@ragenai/common-ui/Card';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';

import { FileListView } from './FileList/FileListView';
import { FileSearch } from './FileSearch';
import { GridView } from './Grid/GridView';
import { LayoutToggle } from './LayoutToggle';

export const FileListWrapper = () => {
  const t = useTranslations('files-table');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchValue, setSearchValue] = useState('');

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

  return (
    <Card title={t('title')} size="full" className="relative">
      <div className="absolute right-4 top-1 flex items-baseline gap-3">
        <FileSearch value={searchValue} onChange={handleSearchChange} />
        <LayoutToggle
          className="hidden md:flex"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
      {viewMode === 'list' ? (
        <FileListView
          isError={isError}
          isLoading={isLoading}
          addDocument={addDocument}
          removeDocument={removeDocument}
          documents={filteredDocuments}
        />
      ) : (
        <GridView
          isError={isError}
          isLoading={isLoading}
          addDocument={addDocument}
          removeDocument={removeDocument}
          documents={filteredDocuments}
        />
      )}
    </Card>
  );
};
