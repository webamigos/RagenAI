'use client';

import format from 'date-fns-tz/format';
import prettyBytes from 'pretty-bytes';
import { usersDocuments } from '@/app/contracts/Documents';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@salesyy/common-ui/Table';
import { Text } from '@salesyy/common-ui/Text';

type Props = {
  documents: usersDocuments[];
};

export const UserDocumentsTable = ({ documents }: Props) => {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>File Name</TableHeader>
          <TableHeader>File Size</TableHeader>
          <TableHeader>Created</TableHeader>
          <TableHeader>Updated</TableHeader>
          <TableHeader className="relative w-0">
            <span className="sr-only">Actions</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {documents.map(
          ({ created_at, updated_at, file_name, file_size, id }) => {
            return (
              <TableRow className="text-sm" key={id}>
                <TableCell>{file_name}</TableCell>
                <TableCell>{prettyBytes(file_size)}</TableCell>
                <TableCell>
                  {created_at ? (
                    format(new Date(created_at), 'dd.MM.yyyy HH:mm:ss')
                  ) : (
                    <Text>-</Text>
                  )}
                </TableCell>
                <TableCell>
                  {updated_at ? (
                    format(new Date(updated_at), 'dd.MM.yyyy HH:mm:ss')
                  ) : (
                    <Text>-</Text>
                  )}
                </TableCell>
              </TableRow>
            );
          }
        )}
      </TableBody>
    </Table>
  );
};
