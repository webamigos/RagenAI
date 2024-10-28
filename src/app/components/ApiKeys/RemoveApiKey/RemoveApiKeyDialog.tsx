'use client';

import { ApiKey } from '@prisma/client';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@salesyy/common-ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'react-toastify';

import { removeApiKey } from './actions';

type Props = {
  keyId: ApiKey['id'];
};

export const RemoveApiKeyDialog = ({ keyId }: Props) => {
  const [idOpened, setIsOpened] = useState(false);
  const { refresh } = useRouter();

  const handleClose = () => {
    setIsOpened(false);
  };

  const handleCancel = () => {
    setIsOpened(false);
  };

  const handleConfirm = async () => {
    const { success } = await removeApiKey(keyId);
    if (success) {
      toast.success('Key was removed');
      refresh();
      setIsOpened(false);
    } else {
      toast.error('Error during removing API Key');
    }
  };

  return (
    <Dialog onClose={handleClose} size="sm" open={idOpened}>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogBody>
        <DialogDescription>
          This is the description for the dialog. You can provide more details
          here.
        </DialogDescription>
      </DialogBody>
      <DialogActions>
        <Button label="Cancel" onClick={handleCancel} />
        <Button label="Confirm" onClick={handleConfirm} />
      </DialogActions>
    </Dialog>
  );
};
