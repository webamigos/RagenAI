import { useEffect, useState } from 'react';

import { getUserDocuments } from '@/app/actions';
import { usersDocuments } from '@/app/contracts/Documents';
import { Card } from '@salesyy/common-ui/Card';
import { SpinnerSVG } from '@salesyy/common-ui/icons';

import { UserDocumentsTable } from './UserDocumentsTable';

type Props = {
  userId: string;
};

export const FileList = ({ userId }: Props) => {
  const [documentDetails, setDocumentDetails] = useState<usersDocuments[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        const { documentDetails, error } = await getUserDocuments(userId);
        if (documentDetails) {
          setDocumentDetails(documentDetails);
        } else {
          setDocumentDetails([]);
        }
      } catch (err) {
        setError(error);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  if (loading) {
    return <SpinnerSVG />;
  }

  return (
    <Card title="Lista plików" size="full">
      <UserDocumentsTable documents={documentDetails} />
    </Card>
  );
};
