import { ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import format from 'date-fns-tz/format';
import { useTranslations } from 'next-intl';

import * as CommonUi from '@salesyy/common-ui';
import { deleteDocument } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';
import { type UsersDocuments } from '@/app/contracts/Documents';
import { classMerge } from '@salesyy/common-ui';

import { truncateFileName } from '../../../lib/utils/truncateFileName';

type Props = {
  documents: UserFileType[];
  onDocumentsUpdate: () => void;
};

type DocumentRowProps = {
  document: UserFileType;
  onDocumentsUpdate: () => void;
};

const DocumentRow = ({ document, onDocumentsUpdate }: DocumentRowProps) => {
  const { created_at, updated_at, file_name, file_size, id, organization_id } =
    document;

  const successTranslatedMessage = useTranslations('success-toast');
  const errorTranslatedMessage = useTranslations('error-toast');
  const translatedTable = useTranslations('files-table');

  const formattedCreatedAt = created_at
    ? format(new Date(created_at), 'dd.MM.yyyy HH:mm:ss')
    : '-';

  const formattedUpdatedAt = updated_at
    ? format(new Date(updated_at), 'dd.MM.yyyy HH:mm:ss')
    : '-';

  const truncatedFileName = truncateFileName(file_name, 20);

  const handleDelete = async (
    organization_id: string,
    document_id: string,
    onDocumentsUpdate: () => void
  ) => {
    const { errorToast, successToast } = statusToast();

    try {
      const { status } = await deleteDocument(organization_id, document_id);
      if (status === 200) {
        onDocumentsUpdate();
        successToast({
          message: `${successTranslatedMessage('deleted')} :${document_id}`,
        });
      }
    } catch (error) {
      errorToast({
        message: `${errorTranslatedMessage('error-during-deleting-file')}`,
      });
    }
  };

  return (
    <>
      <CommonUi.TableRow className="text-sm">
        <CommonUi.TableCell title={file_name}>
          {truncatedFileName}
        </CommonUi.TableCell>
        <CommonUi.TableCell>{prettyBytes(file_size)}</CommonUi.TableCell>
        <CommonUi.TableCell>{formattedCreatedAt}</CommonUi.TableCell>
        <CommonUi.TableCell>{formattedUpdatedAt}</CommonUi.TableCell>
        <CommonUi.TableCell>
          <div className="-mx-3 -my-1.5 sm:-mx-2.5">
            <CommonUi.Dropdown>
              <CommonUi.DropdownButton>
                <CommonUi.EllipsiHorizontalIcon />
              </CommonUi.DropdownButton>
              <CommonUi.DropdownMenu anchor="bottom end">
                <CommonUi.DropdownItem
                  onClick={() =>
                    handleDelete(organization_id, id, onDocumentsUpdate)
                  }
                >
                  <CommonUi.Tooltip
                    id="delete doc"
                    place="top"
                    content={translatedTable('delete')}
                  >
                    <CommonUi.TrashIcon />
                  </CommonUi.Tooltip>
                </CommonUi.DropdownItem>
              </CommonUi.DropdownMenu>
            </CommonUi.Dropdown>
          </div>
        </CommonUi.TableCell>
      </CommonUi.TableRow>
    </>
  );
};

export const UserDocumentsTable = ({
  className,
  documents,
  onDocumentsUpdate,
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
            onDocumentsUpdate={onDocumentsUpdate}
          />
        ))}
      </CommonUi.TableBody>
    </CommonUi.Table>
  );
};
