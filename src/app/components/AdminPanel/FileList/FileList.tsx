import { memo } from 'react';

import { SpinnerSVG } from '@salesyy/common-ui/icons';
import { statusToast } from '@/app/lib/utils/toast';
import { UserDocumentsTable } from './UserDocumentsTable';
import { useUserDocumentsContext } from '@/app/hooks/useUserDocumentsContext';

export const FileList = memo(() => {
  const { documents, isLoading, isError, refreshDocuments } =
    useUserDocumentsContext();
  const { errorToast } = statusToast();

  if (isLoading) {
    return <SpinnerSVG size="sm" />;
  }

  if (isError) {
    errorToast({ message: 'Błąd podczas pobierania dokumentów' });
  }

  return (
    <UserDocumentsTable
      className="font-sans"
      documents={documents || []}
      onDocumentsUpdate={refreshDocuments}
    />
  );
});

FileList.displayName = 'FileList';
