import { useState, useMemo, type ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import * as CommonUi from '@ragenai/common-ui';
import { deleteDocumentAction } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';
import { truncateFileName } from '../../../lib/utils/truncateFileName';
import { useSettings } from '@/app/hooks/useSettings';

import { formatDates } from '@/app/lib/utils/formatDate';
import { type UserFileType } from '@/app/contracts/Documents';
import { Link } from '@/i18n/routing';

type Props = {
  documents: UserFileType[];
  onAddDocument: (newDocument: UserFileType) => void;
  onRemoveDocument: (documentId: string) => void;
};

type DocumentRowProps = {
  document: UserFileType;
  onRemoveDocument: (documentId: string) => void;
};

const DocumentRow = ({ document, onRemoveDocument }: DocumentRowProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);

  const { created_at, updated_at, file_name, file_size, id, organization_id } =
    document;

  const { successToast, errorToast } = statusToast();
  const tSuccess = useTranslations('success-toast');
  const tError = useTranslations('error-toast');
  const { refreshSettings } = useSettings();
  const router = useRouter();

  const { created_at: formattedCreatedAt, updated_at: formattedUpdatedAt } =
    useMemo(
      () => formatDates({ created_at, updated_at }),
      [created_at, updated_at]
    );
  const truncatedFileName = useMemo(
    () => truncateFileName(file_name, 20),
    [file_name]
  );

  const handlePrefetch = (path: string) => {
    router.prefetch(path);
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const { status } = await deleteDocumentAction(organization_id, id);
      if (status === 200) {
        onRemoveDocument(id);
        refreshSettings();
        successToast({ message: `${tSuccess('deleted')} ${file_name}` });
      }
    } catch {
      errorToast({ message: tError('error-during-deleting-file') });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CommonUi.TableRow className="text-sm overflow-x-hidden">
      <CommonUi.TableCell title={file_name}>
        {truncatedFileName}
      </CommonUi.TableCell>
      <CommonUi.TableCell>{prettyBytes(file_size)}</CommonUi.TableCell>
      <CommonUi.TableCell>{formattedCreatedAt}</CommonUi.TableCell>
      <CommonUi.TableCell>{formattedUpdatedAt}</CommonUi.TableCell>
      <CommonUi.TableCell className="relative -mx-3 mr-10 -my-1.5 sm:-mx-2.5">
        <div
          onMouseEnter={() => setShowToolbar(true)}
          onMouseLeave={() => setShowToolbar(false)}
          className="relative flex items-center space-x-2"
        >
          <div
            className={`absolute -left-10 flex space-x-2 transition-all duration-300 ${
              showToolbar
                ? 'opacity-100 -translate-x-0'
                : 'opacity-0 -translate-x-4'
            }`}
          >
            <Link
              className="text-black dark:text-white"
              href={`/document/${id}?edit=true`}
              onMouseEnter={() => handlePrefetch(`/document/${id}?edit=true`)}
            >
              <CommonUi.PencilIcon className="mt-0.5 cursor-pointer" />
            </Link>

            <Link
              className="text-black dark:text-white"
              href={`/document/${id}`}
              onMouseEnter={() => handlePrefetch(`/document/${id}`)}
            >
              <CommonUi.OpenEyeIcon className="cursor-pointer" />
            </Link>
            <div onClick={handleDelete} className="mt-0.5 cursor-pointer">
              {isLoading ? (
                <CommonUi.SpinnerSVG className="mt-0.5 ml-0.5" size="sm" />
              ) : (
                <CommonUi.TrashIcon />
              )}
            </div>
          </div>
          <div
            className={`transition-all duration-300 ${
              showToolbar
                ? 'opacity-0 translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
          >
            <CommonUi.ArrowIcon className="cursor-pointer" />
          </div>
        </div>
      </CommonUi.TableCell>
    </CommonUi.TableRow>
  );
};

export const UserDocumentsTable = ({
  documents,
  onRemoveDocument,
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
  return (
    <CommonUi.Table className="overflow-x-auto">
      <CommonUi.TableHead>
        <CommonUi.TableRow className="text-base">
          <CommonUi.TableHeader>{t('file-name')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>{t('file-size')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>{t('created')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>{t('updated')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>
            <span className="sr-only">Actions</span>
          </CommonUi.TableHeader>
        </CommonUi.TableRow>
      </CommonUi.TableHead>
      <CommonUi.TableBody>
        {documents.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            onRemoveDocument={onRemoveDocument}
          />
        ))}
      </CommonUi.TableBody>
    </CommonUi.Table>
  );
};
