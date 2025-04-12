import * as CommonUi from '@ragenai/common-ui';
import { useState } from 'react';
import { ToolbarActionsMenu } from '../ToolbarActionsMenu';

type ToolbarActionsProps = {
  filePublicId: string;
  documentPublicId?: string;
  fileName: string;
  onPrefetch: (path: string) => void;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActions = ({
  filePublicId,
  documentPublicId,
  onPrefetch,
  toggleModal,
  isLoading,
}: ToolbarActionsProps) => {
  const [showToolbar, setShowToolbar] = useState(false);

  return (
    <div
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
      className="relative flex items-center space-x-2 z-50"
    >
      <div
        className={`absolute -left-10 flex space-x-2 transition-all duration-300 ${
          showToolbar
            ? 'opacity-100 -translate-x-0'
            : 'invisible -translate-x-4'
        }`}
      >
        <ToolbarActionsMenu
          filePublicId={filePublicId}
          documentPublicId={documentPublicId}
          onPrefetch={onPrefetch}
          toggleModal={toggleModal}
          isLoading={isLoading}
        />
      </div>

      <div
        className={`transition-all duration-300 ${
          showToolbar ? 'invisible translate-x-4' : 'opacity-100 translate-x-0'
        }`}
      >
        <CommonUi.ArrowIcon className="cursor-pointer" />
      </div>
    </div>
  );
};
