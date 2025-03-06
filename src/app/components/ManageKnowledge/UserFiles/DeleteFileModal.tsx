import { useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { Button, Card, Text, classMerge } from '@ragenai/common-ui';

type Props = {
  className?: string;
  isLoading?: boolean;
  fileName: string;
  organization_id: string;
  documentId: string;
  toggleModal: (fileId: string | null) => void;
  handleDelete: (
    organizationId: string,
    documentId: string,
    fileName: string
  ) => void;
};

export const DeleteFileModal = ({
  className,
  fileName,
  isLoading,
  documentId,
  organization_id,
  toggleModal,
  handleDelete,
}: Props) => {
  const t = useTranslations('file-delete-modal');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      modalRef.current.focus();
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center w-full h-full bg-black bg-opacity-50 overflow-y-auto px-4 py-6"
      onClick={() => toggleModal(null)}
    >
      <Card
        ref={modalRef}
        tabIndex={-1}
        size="md"
        className={classMerge(
          'relative p-6 bg-white dark:bg-accent-dark-500 rounded-md shadow-lg max-w-md w-full m-auto',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-row flex-wrap">
          <Text className="mr-0.5">{t('are-you-sure')}:</Text>{' '}
          <Text
            fontWeight="medium"
            className="break-words break-all whitespace-normal max-w-full"
          >
            {fileName}?
          </Text>
        </div>
        <div className="flex justify-center mt-4 gap-2">
          <Button
            className="bg-red-500 hover:bg-red-400 dark:bg-red-500 dark:hover:bg-red-400"
            onClick={() => handleDelete(organization_id, documentId, fileName)}
            disabled={isLoading}
          >
            {isLoading ? t('deleting') : t('yes')}
          </Button>
          <Button onClick={() => toggleModal(null)}>{t('no')}</Button>
        </div>
      </Card>
    </div>
  );
};
