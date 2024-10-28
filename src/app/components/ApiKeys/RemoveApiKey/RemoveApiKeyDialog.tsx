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

type Props = {
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

// TODO: translations
export const RemoveApiKeyDialog = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  isPending = false,
}: Props) => {
  return (
    <Dialog onClose={onClose} size="sm" open={isOpen}>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogBody>
        <DialogDescription>
          This is the description for the dialog. You can provide more details
          here.
        </DialogDescription>
      </DialogBody>
      <DialogActions>
        <Button label="Cancel" onClick={onCancel} />
        <Button label="Confirm" onClick={onConfirm} isLoading={isPending} />
      </DialogActions>
    </Dialog>
  );
};
