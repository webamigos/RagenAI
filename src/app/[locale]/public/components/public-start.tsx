'use client';

import { useTranslations } from 'next-intl';
import { memo } from 'react';

import { PublicChatInterface } from './PublicChatInterface';

const PublicStart = memo(
  ({
    organizationId,
    widgetMode = false,
  }: {
    organizationId: string;
    widgetMode?: boolean;
  }) => {
    const t = useTranslations('Chatbot');
    // const {  checkExistingThread } = useNewThread({
    //   organizationId,
    //   widgetMode,
    // });

    // useEffect(() => {
    //   const checkThread = async () => {
    //     if (widgetMode) {
    //       await checkExistingThread();
    //     }
    //   };

    //   checkThread();
    // }, [widgetMode, checkExistingThread]);
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
