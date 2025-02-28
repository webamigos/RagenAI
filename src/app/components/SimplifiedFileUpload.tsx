'use client';

import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';
import { FileUploader, Button, Text } from '@ragenai/common-ui';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useFileUpload } from '@/app/hooks/useFileUpload';

type Props = {
  projectId: number;
  projectPublicId: string;
};

export const SimplifiedFileUpload = ({ projectId, projectPublicId }: Props) => {
  const t = useTranslations('projects');
  const { organization } = useOrganization();
  const { files, uploading, handleFilesAdded, handleFileRemove, uploadFiles } =
    useFileUpload(projectId, projectPublicId);

  if (!organization) {
    return null;
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-medium mb-4">{t('upload.title')}</h3>
      <div className="flex gap-4 items-start">
        <div className="flex-1">
          <FileUploader
            onFilesAdded={handleFilesAdded}
            disabled={uploading}
            className="min-h-0"
          />
          {files.length > 0 && (
            <div className="mt-4">
              <Text className="font-medium mb-2">
                {t('upload.selected-files')}
              </Text>
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between bg-gray-50 dark:bg-accent-dark-500 p-2 rounded"
                  >
                    <span className="truncate max-w-[300px]">{file.name}</span>
                    <button
                      onClick={() => handleFileRemove(index)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      disabled={uploading}
                      title={t('upload.remove-file')}
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Button
          disabled={uploading || files.length < 1}
          isLoading={uploading}
          isSubmit={!uploading}
          onClick={uploadFiles}
          label={
            files.length
              ? t('upload.button-with-count', { count: files.length })
              : t('upload.button')
          }
        />
      </div>
    </div>
  );
};
