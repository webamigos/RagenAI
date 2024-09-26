'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { FileList } from './FileList';
import { SpinnerSVG } from '@salesyy/common-ui/icons';

export const FileListWrapper = () => {
  const { user, isLoaded } = useUser();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && user?.publicMetadata.visitorId) {
      setUserId(user.publicMetadata.visitorId as string);
    }
  }, [isLoaded, user]);

  if (!userId) {
    return <SpinnerSVG />;
  }

  return <FileList userId={userId} />;
};
