'use client';

import format from 'date-fns-tz/format';
import prettyBytes from 'pretty-bytes';

import { usersDocuments } from '@/app/contracts/Documents';
import * as Table from '@salesyy/common-ui/Table';
import * as Dropdown from '@salesyy/common-ui/Dropdown';
import { EllipsiHorizontalIcon } from '@salesyy/common-ui/icons';
import { Text } from '@salesyy/common-ui/Text';
import { deleteDocument } from '@/app/actions';
import { logger } from '@/app/lib/utils/logger';

type Props = {
  documents: usersDocuments[];
};

const truncateFileName = (fileName: string, maxLength: number) => {
  if (fileName.length > maxLength) {
    return fileName.slice(0, maxLength) + '...';
  }
  return fileName;
};

const handleDelete = async (visitor_id: string, document_id: string) => {
  try {
    await deleteDocument(visitor_id, document_id);
  } catch (error) {
    logger.error('Błąd podczas usuwania dokumentu:', error);
  }
};

export const UserDocumentsTable = ({ documents }: Props) => {
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
        {documents.map(
          ({
            created_at,
            updated_at,
            file_name,
            file_size,
            id,
            visitor_id,
          }) => {
            return (
              <Table.TableRow className="text-sm" key={id}>
                <Table.TableCell title={file_name}>
                  {truncateFileName(file_name, 20)}
                </Table.TableCell>
                <Table.TableCell>{prettyBytes(file_size)}</Table.TableCell>
                <Table.TableCell>
                  {created_at ? (
                    format(new Date(created_at), 'dd.MM.yyyy HH:mm:ss')
                  ) : (
                    <Text>-</Text>
                  )}
                </Table.TableCell>
                <Table.TableCell>
                  {updated_at ? (
                    format(new Date(updated_at), 'dd.MM.yyyy HH:mm:ss')
                  ) : (
                    <Text>-</Text>
                  )}
                </Table.TableCell>
                <Table.TableCell>
                  <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                    <Dropdown.Dropdown>
                      <Dropdown.DropdownButton>
                        <EllipsiHorizontalIcon />
                      </Dropdown.DropdownButton>
                      <Dropdown.DropdownMenu anchor="bottom end">
                        <Dropdown.DropdownItem
                          onClick={() => handleDelete(visitor_id, id)}
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
        )}
      </Table.TableBody>
    </Table.Table>
  );
};
