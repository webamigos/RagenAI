import { useState } from 'react';
import { GlobalAltIcon } from '@ragenai/common-ui/icons';

import { ShareDialog } from './ShareDialog';
import { useToggleChatbotEnabled } from '@/app/hooks/useToggleChatbotEnabled';

type ShareDialogTriggerProps = {
  projectId: number;
  isPublicProject: boolean;
  accessToken: string;
  publishedAt: string;
  isChatbotEnabled: boolean;
};

export const ShareDialogTrigger = ({
  projectId,
  isPublicProject,
  accessToken,
  publishedAt,
  isChatbotEnabled,
}: ShareDialogTriggerProps) => {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const { toggleChatbotEnabled } = useToggleChatbotEnabled(projectId);

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
        isPublicProject={isPublicProject}
        linkToPublicProject={accessToken}
        publishedAt={publishedAt}
        isChatbotEnabled={isChatbotEnabled}
        onChatbotEnabledChange={toggleChatbotEnabled}
      />
    </>
  );
};
