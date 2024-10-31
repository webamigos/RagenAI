import { useState } from 'react';
import { ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import format from 'date-fns-tz/format';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';

import * as CommonUi from '@salesyy/common-ui';
import { classMerge } from '@salesyy/common-ui';
import { deleteDocument } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';
import { truncateFileName } from '../../../lib/utils/truncateFileName';

import { type UserFileType } from '@/app/contracts/Documents';

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

  const successTranslatedMessage = useTranslations('success-toast');
  const errorTranslatedMessage = useTranslations('error-toast');
  const { errorToast, successToast } = statusToast();
  const locale = useLocale();

  const formattedCreatedAt = created_at
    ? format(new Date(created_at), 'dd.MM.yyyy HH:mm:ss')
    : '-';
  const formattedUpdatedAt = updated_at
    ? format(new Date(updated_at), 'dd.MM.yyyy HH:mm:ss')
    : '-';
  const truncatedFileName = truncateFileName(file_name, 20);

  const handleDelete = async () => {
    setIsLoading(true);

    try {
      const { status } = await deleteDocument(organization_id, id);
      if (status === 200) {
        onRemoveDocument(id);
        successToast({
          message: `${successTranslatedMessage('deleted')} ${file_name}`,
        });
      }
    } catch (error) {
      errorToast({
        message: `${errorTranslatedMessage('error-during-deleting-file')}`,
      });
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
            <CommonUi.Link
              className="text-white"
              href={`/${locale}/document/${id}?edit=true`}
            >
              <CommonUi.PencilIcon className="mt-0.5 cursor-pointer" />
            </CommonUi.Link>

            <CommonUi.Link
              className="text-white"
              href={`/${locale}/document/${id}`}
            >
              <CommonUi.OpenEyeIcon className="cursor-pointer" />
            </CommonUi.Link>
            {isLoading ? (
              <CommonUi.SpinnerSVG size="sm" className="ml-1" />
            ) : (
              <CommonUi.TrashIcon
                onClick={handleDelete}
                className="cursor-pointer"
              />
            )}
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
  className,
  documents,
  onRemoveDocument,
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
  return (
    <CommonUi.Table className={classMerge(className)}>
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
