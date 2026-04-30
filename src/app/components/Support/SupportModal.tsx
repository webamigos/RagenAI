'use client';

import { Dialog, DialogTitle, DialogBody } from '@ragenai/common-ui/Dialog';
import { SupportWizard } from './SupportWizard';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const SupportModal = ({ isOpen, onClose }: Props) => {
  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>Support</DialogTitle>
      <DialogBody>
        <SupportWizard context="modal" onClose={onClose} />
      </DialogBody>
    </Dialog>
  );
};
