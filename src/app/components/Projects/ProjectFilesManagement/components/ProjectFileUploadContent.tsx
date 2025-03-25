import {
  Text,
  Skeleton,
  RSSIcon,
  DocumentIcon,
  ClourArrowIcon,
} from '@ragenai/common-ui';

export type FileStatus = {
  hasFiles: boolean;
  fileCount: number;
  loading: boolean;
};

type ProjectFileUploadContentProps = {
  status: FileStatus;
  t: (value: string) => string;
  onRssClick?: () => void;
};

export const ProjectFileUploadContent = ({
  status,
  t,
  onRssClick,
}: ProjectFileUploadContentProps) => {
  const { hasFiles, fileCount, loading } = status;

  if (loading) {
    return <Skeleton className="-mt-4" height="h-20" />;
  }

  if (hasFiles) {
    return (
      <div className="flex items-center justify-between w-full">
        <div
          className="absolute top-1 right-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 duration-200 p-1 hover:bg-gray-200 dark:hover:bg-accent-dark-500 rounded-lg transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onRssClick?.();
          }}
        >
          <RSSIcon className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <Text className="font-medium text-gray-900 dark:text-gray-200">
            {t('project-files')}
          </Text>
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            {fileCount}{' '}
            {fileCount === 1 ? t('file-singular') : t('file-plural')}
          </Text>
        </div>
        <div className="flex items-center">
          <div className="flex items-center">
            {Array.from({ length: Math.min(fileCount, 5) }).map((_, index) => (
              <div
                key={index}
                className="h-8 w-8 bg-primary-blue-500 rounded-full flex items-center justify-center text-white shadow-md -ml-2 first:ml-0"
                style={{ zIndex: 5 - index }}
              >
                <DocumentIcon />
              </div>
            ))}
          </div>
          {fileCount > 5 && (
            <Text className="ml-1 text-sm font-medium text-gray-600 dark:text-gray-400">
              +{fileCount - 5}
            </Text>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-12 justify-center">
      <div className="flex items-center gap-2 dark:text-gray-200">
        <Text className="font-medium text-gray-900 dark:text-gray-200">
          {t('upload-file')}
        </Text>
        <ClourArrowIcon className="h-6 w-6 text-primary-blue-500" />
      </div>
    </div>
  );
};
