// components/DocumentPreviewModal.tsx
import { useEffect, useState } from 'react';
import * as CommonUi from '@salesyy/common-ui';
import { type usersDocuments } from '@/app/contracts/Documents';

type Props = {
  isOpen: boolean;
  document: usersDocuments;
  onClose: () => void;
};

const DocumentPreviewModal = ({ document, onClose, isOpen }: Props) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <CommonUi.Dialog
      open={isOpen}
      onClose={onClose}
      title={`Podgląd: ${document.file_name}`}
    >
      {/* <div className="p-4">{renderContent()}</div> */}
      <CommonUi.DialogActions>
        <CommonUi.Button onClick={onClose}>Zamknij</CommonUi.Button>
      </CommonUi.DialogActions>
    </CommonUi.Dialog>
  );
};

export default DocumentPreviewModal;
