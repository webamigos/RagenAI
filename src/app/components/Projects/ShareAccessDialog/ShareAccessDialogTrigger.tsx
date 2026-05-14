'use client';

import { useState } from 'react';
import { UserPlusIcon } from '@heroicons/react/24/outline';
import { Button } from '@ragenai/common-ui/Button';

import { ShareAccessDialog } from './ShareAccessDialog';

type Props = {
  projectId: string;
  projectTitle: string;
  ownerName?: string;
};

export function ShareAccessDialogTrigger({
  projectId,
  projectTitle,
  ownerName,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" outline onClick={() => setOpen(true)}>
        <UserPlusIcon className="size-4 mr-1" />
        Share access
      </Button>

      {open && (
        <ShareAccessDialog
          isOpen={open}
          onClose={() => setOpen(false)}
          projectId={projectId}
          projectTitle={projectTitle}
          ownerName={ownerName}
        />
      )}
    </>
  );
}
