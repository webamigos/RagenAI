'use client';

import { memo, useEffect } from 'react';

import { PublicChatInterface } from './PublicChatInterface';
import { useNewThread } from '../hooks/useNewThread';

const PublicStart = memo(
  ({
    organizationId,
    widgetMode = false,
  }: {
    organizationId: string;
    widgetMode?: boolean;
  }) => {
    const { checkExistingThread } = useNewThread({
      organizationId,
      widgetMode,
    });

    useEffect(() => {
      const checkThread = async () => {
        if (widgetMode) {
          await checkExistingThread();
        }
      };

      checkThread();
    }, [widgetMode, checkExistingThread]);
    return (
      <PublicChatInterface
        organizationId={organizationId}
        widgetMode={widgetMode}
      />
    );
  }
);

PublicStart.displayName = 'PublicStart';

export { PublicStart };
