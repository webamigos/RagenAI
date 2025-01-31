import * as CommonUi from '@ragenai/common-ui';
import { useState } from 'react';
import { ToolbarActionsMenu } from '../ToolbarActionsMenu';

type ToolbarActionsProps = {
  documentId: string;
  fileName: string;
  onPrefetch: (path: string) => void;
  toggleModal: (fileId: string | null) => void;
  isLoading: boolean;
};

export const ToolbarActions = ({
  documentId,
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
            : 'opacity-0 -translate-x-4'
        }`}
      >
        <ToolbarActionsMenu
          documentId={documentId}
          onPrefetch={onPrefetch}
          toggleModal={toggleModal}
          isLoading={isLoading}
        />
      </div>

      <div
        className={`transition-all duration-300 ${
          showToolbar ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
        }`}
      >
        <CommonUi.ArrowIcon className="cursor-pointer" />
      </div>
    </div>
  );
};
