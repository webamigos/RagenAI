import { Text } from '@ragenai/common-ui/Text';
import { Skeleton } from '@ragenai/common-ui/Skeleton';
import { DocumentIcon, CloudArrowIcon } from '@ragenai/common-ui/icons';

export interface FileStatus {
  hasFiles: boolean;
  fileCount: number;
  loading: boolean;
}

interface ProjectFileUploadContentProps {
  status: FileStatus;
  t: (value: string) => string;
  compact?: boolean;
}

export const ProjectFileUploadContent = ({
  status,
  t,
  compact,
}: ProjectFileUploadContentProps) => {
  const { hasFiles, fileCount, loading } = status;

  if (loading) {
    return <Skeleton className="-mt-4" height="h-20" />;
  }

  if (hasFiles) {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex flex-col">
          <Text className="font-medium text-foreground">
            {t('project-files')}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {fileCount}{' '}
            {fileCount === 1 ? t('file-singular') : t('file-plural')}
          </Text>
        </div>
        <div className="flex items-center">
          <div className="flex items-center">
            {Array.from({ length: Math.min(fileCount, 5) }).map((_, index) => (
              <div
                key={index}
                className="h-8 w-8 bg-brand-500 rounded-full flex items-center justify-center text-primary-foreground shadow-md -ml-2 first:ml-0"
                style={{ zIndex: 5 - index }}
              >
                <DocumentIcon />
              </div>
            ))}
          </div>
          {fileCount > 5 && (
            <Text className="ml-1 text-sm font-medium text-muted-foreground">
              +{fileCount - 5}
            </Text>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-12 justify-center">
      <div className="flex items-center gap-2 dark:text-foreground">
        <Text className="font-medium text-foreground">{t('upload-file')}</Text>
        <CloudArrowIcon className="h-6 w-6 text-brand-500" />
      </div>
    </div>
  );
};
