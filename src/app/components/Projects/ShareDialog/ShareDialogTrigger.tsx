import { useState } from 'react';
import { GlobalAltIcon } from '@ragenai/common-ui';

import { ShareDialog } from './ShareDialog';

type ShareDialogTriggerProps = {
  projectId: number;
};

export const ShareDialogTrigger = ({ projectId }: ShareDialogTriggerProps) => {
  const [showShareDialog, setShowShareDialog] = useState(false);

  const handleDialogClose = () => {
    setShowShareDialog(false);
  };

  return (
    <>
      <div
        onClick={() => setShowShareDialog(true)}
        className="cursor-pointer p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <GlobalAltIcon className="w-4 h-4 text-gray-500" />
      </div>

      <ShareDialog
        open={showShareDialog}
        onClose={handleDialogClose}
        projectId={projectId}
      />
    </>
  );
};
