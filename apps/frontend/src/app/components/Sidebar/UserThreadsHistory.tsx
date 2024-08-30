import { useTranslations } from 'next-intl';

import { SidebarSection, SidebarLabel, SidebarItem } from '@salesyy/common-ui';
import { ChatConversation, SpinnerSVG } from '@salesyy/common-ui';

import { ThreadHistoryResponse } from '../../contracts/Message';

type Props = {
  noThreads: boolean;
  isLoading: boolean;
  error: string | null;
  userThreads: ThreadHistoryResponse[];
  handleThreadClick: (threadId: string) => void;
};

export const UserThreadsHistory = ({
  noThreads,
  error,
  isLoading,
  userThreads,
  handleThreadClick,
}: Props) => {
  const t = useTranslations('chat');
  return (
    <SidebarSection>
      {!noThreads && (
        <div className="flex items-center cursor-pointer ml-2 mb-2 gap-2 text-lg">
          <ChatConversation />
          <SidebarLabel>{t('chat-history')}</SidebarLabel>
        </div>
      )}
      {isLoading && <SpinnerSVG />}
      {error && <SidebarLabel className="text-red-500">{error}</SidebarLabel>}
      {userThreads.map((thread) => (
        <SidebarItem
          key={thread.id}
          onClick={() => handleThreadClick(thread.public_id)}
        >
          {thread.messages[0].content}
        </SidebarItem>
      ))}
    </SidebarSection>
  );
};
