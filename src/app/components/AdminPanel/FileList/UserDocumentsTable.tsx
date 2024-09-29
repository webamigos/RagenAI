import { memo, useMemo } from 'react';
import format from 'date-fns-tz/format';
import prettyBytes from 'pretty-bytes';

import { type usersDocuments } from '@/app/contracts/Documents';
import * as Table from '@salesyy/common-ui/Table';
import * as Dropdown from '@salesyy/common-ui/Dropdown';
import { EllipsiHorizontalIcon } from '@salesyy/common-ui/icons';
import { deleteDocument } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';

type Props = {
  documents: usersDocuments[];
  onDocumentsUpdate: () => void;
};

const truncateFileName = (fileName: string, maxLength: number) => {
  if (fileName.length > maxLength) {
    return fileName.slice(0, maxLength) + '...';
  }
  return fileName;
};

const handleDelete = async (
  visitor_id: string,
  document_id: string,
  onDocumentsUpdate: () => void
) => {
  const { errorToast, successToast } = statusToast();
  try {
    await deleteDocument(visitor_id, document_id);
    onDocumentsUpdate();
    successToast({ message: `Usunięto: ${document_id}` });
  } catch (error) {
    errorToast({ message: 'Błąd podczas usuwania dokumentu' });
  }
};

const DocumentRow = memo(
  ({
    document,
    onDocumentsUpdate,
  }: {
    document: usersDocuments;
    onDocumentsUpdate: () => void;
  }) => {
    const { created_at, updated_at, file_name, file_size, id, visitor_id } =
      document;

    const formattedCreatedAt = useMemo(() => {
      return created_at
        ? format(new Date(created_at), 'dd.MM.yyyy HH:mm:ss')
        : '-';
    }, [created_at]);

    const formattedUpdatedAt = useMemo(() => {
      return updated_at
        ? format(new Date(updated_at), 'dd.MM.yyyy HH:mm:ss')
        : '-';
    }, [updated_at]);

    const truncatedFileName = useMemo(
      () => truncateFileName(file_name, 20),
      [file_name]
    );

    return (
      <Table.TableRow className="text-sm" key={id}>
        <Table.TableCell title={file_name}>{truncatedFileName}</Table.TableCell>
        <Table.TableCell>{prettyBytes(file_size)}</Table.TableCell>
        <Table.TableCell>{formattedCreatedAt}</Table.TableCell>
        <Table.TableCell>{formattedUpdatedAt}</Table.TableCell>
        <Table.TableCell>
          <div className="-mx-3 -my-1.5 sm:-mx-2.5">
            <Dropdown.Dropdown>
              <Dropdown.DropdownButton>
                <EllipsiHorizontalIcon />
              </Dropdown.DropdownButton>
              <Dropdown.DropdownMenu anchor="bottom end">
                <Dropdown.DropdownItem
                  onClick={() =>
                    handleDelete(visitor_id, id, onDocumentsUpdate)
                  }
                >
                  Delete
                </Dropdown.DropdownItem>
              </Dropdown.DropdownMenu>
            </Dropdown.Dropdown>
          </div>
        </Table.TableCell>
      </Table.TableRow>
    );
  }
);

DocumentRow.displayName = 'DocumentRow';

export const UserDocumentsTable = memo(
  ({ documents, onDocumentsUpdate }: Props) => {
    return (
      <Table.Table>
        <Table.TableHead>
          <Table.TableRow className="text-base">
            <Table.TableHeader>File Name</Table.TableHeader>
            <Table.TableHeader>File Size</Table.TableHeader>
            <Table.TableHeader>Created</Table.TableHeader>
            <Table.TableHeader>Updated</Table.TableHeader>
            <Table.TableHeader>
              <span className="sr-only">Actions</span>
            </Table.TableHeader>
          </Table.TableRow>
        </Table.TableHead>
        <Table.TableBody>
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              onDocumentsUpdate={onDocumentsUpdate}
            />
          ))}
        </Table.TableBody>
      </Table.Table>
    );
  }
);

UserDocumentsTable.displayName = 'UserDocumentsTable';
