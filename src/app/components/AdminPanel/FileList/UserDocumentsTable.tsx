import { useState } from 'react';
import { ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import format from 'date-fns-tz/format';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';

import * as CommonUi from '@salesyy/common-ui';
import { deleteDocument } from '@/app/actions';
import { type UserFileType } from '@/app/contracts/Documents';
import { classMerge } from '@salesyy/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { truncateFileName } from '../../../lib/utils/truncateFileName';

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
      <CommonUi.TableCell>
        <div className="-mx-3 mr-10 -my-1.5 sm:-mx-2.5">
          <CommonUi.Link href={`/${locale}/document/${id}`}>
            <a className="text-blue-500 hover:underline">
              <CommonUi.OpenEyeIcon className="cursor-pointer" />
            </a>
          </CommonUi.Link>
        </div>
      </CommonUi.TableCell>
      <CommonUi.TableCell>
        <div className="-mx-3 mr-10 -my-1.5 sm:-mx-2.5">
          {isLoading ? (
            <CommonUi.SpinnerSVG size="sm" className="ml-1" />
          ) : (
            <CommonUi.TrashIcon
              onClick={handleDelete}
              className="cursor-pointer"
            />
          )}
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
