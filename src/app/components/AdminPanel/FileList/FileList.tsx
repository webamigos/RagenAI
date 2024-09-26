'use server';

import { Card } from '@salesyy/common-ui';
import { UserDocumentsTable } from './UserDocumentsTable';
import { fetchUserDocumentsDetails } from '@/app/lib/services/document';

type Props = {
  userId: string;
};

export const FileList = async ({ userId }: Props) => {
  const response = await fetchUserDocumentsDetails(userId);

  return (
    <Card title="Lista plików" size="full">
      <UserDocumentsTable documents={response} />
    </Card>
  );
};
