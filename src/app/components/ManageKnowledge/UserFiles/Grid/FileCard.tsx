import { format } from 'date-fns';
import prettyBytes from 'pretty-bytes';

import { truncateFileName } from '@/app/lib/utils/truncateFileName';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { Text } from '@ragenai/common-ui/Text';
import { Tooltip } from '@ragenai/common-ui/Tooltip';
import { Link } from '@/i18n/routing';

import type { UserFileTypeSafe } from '../FileList/UserFilesTable';
import { ToolbarActionsMenu } from '../ToolbarActionsMenu';

type Props = {
  file: UserFileTypeSafe;
  isLoading: boolean;
  toggleModal: (fileId: string | null) => void;
};

export const FileCard = ({ file, isLoading, toggleModal }: Props) => {
  const { file_name, file_size, file_type, public_id, created_at, document } =
    file;

  const fileIcon = getFileIcon(file_type);
  const formattedCreatedAt = created_at
    ? format(new Date(created_at), 'yyyy-MM-dd')
    : '-';

  const hasThumbnail = !!file.thumbnail_s3_key;
  const isPdf = file_type === 'PDF';
  const documentLink = document?.public_id
    ? `/document/${document.public_id}`
    : undefined;

  const renderPreview = () => {
    if (hasThumbnail) {
      return (
        <img
          src={`/api/files/${public_id}/thumbnail`}
          alt={`Preview of ${file_name}`}
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />
      );
    }

    if (isPdf && public_id) {
      return (
        <div className="w-full h-full overflow-hidden pointer-events-none -m-1">
          <iframe
            src={`/api/files/${public_id}#navpanes=0&toolbar=0&view=FitH&scrollbar=0`}
            className="w-[300%] h-[300%] border-0 origin-top-left scale-[0.35] -mt-[3%] -ml-[1%]"
            title={`Preview ${file_name}`}
            tabIndex={-1}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center text-5xl opacity-30">
        {fileIcon}
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-slate-100 dark:bg-accent-dark-500 rounded-lg shadow-sm overflow-hidden group">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{fileIcon}</span>
          <Tooltip
            delayShow={1000}
            place="top"
            content={file_name}
            id={`tooltip-${public_id}`}
          >
            <Text fontSize="xs" className="truncate">
              {truncateFileName(file_name, 35)}
            </Text>
          </Tooltip>
        </div>
      </div>

      <div className="relative mx-3 mb-1 bg-white dark:bg-accent-dark-lightness rounded overflow-hidden aspect-[1/1.3]">
        {renderPreview()}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/80 dark:bg-zinc-900/80">
          <ToolbarActionsMenu
            toggleModal={toggleModal}
            isLoading={isLoading}
            filePublicId={public_id}
            documentPublicId={document?.public_id}
          />
        </div>
        {documentLink && (
          <Link
            href={documentLink}
            className="absolute inset-0 z-0 group-hover:z-[-1]"
            aria-label={`Open ${file_name}`}
          />
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{formattedCreatedAt}</span>
        <span>{prettyBytes(file_size)}</span>
      </div>
    </div>
  );
};
