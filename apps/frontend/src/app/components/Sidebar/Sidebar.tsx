'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  SidebarBody,
  SidebarSection,
  SidebarItem,
  SidebarLabel,
  SidebarHeader,
  SidebarFooter,
  LogoutIcon,
} from '@salesyy/common-ui';
import { SidebarLayout } from '@salesyy/common-ui';
import { Navbar } from '@salesyy/common-ui';
import { ChatConversation } from '@salesyy/common-ui';

import { Logo } from '../Logo';
import { NavHeader } from '../NavHeader';
import { getUserMessages } from '../../actions';
import { loadFingerprint } from '../../lib/utils/fingerprint';
import { logger } from '../../lib/utils/logger';

import type { ThreadHistoryResponse } from '../../contracts/Message';
import { UserLinks } from '../UserLinks';

type Props = {
  children: React.ReactNode;
};

export const Sidebar = ({ children }: Props) => {
  const [userThreads, setUserThreads] = useState<ThreadHistoryResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { push } = useRouter();

  const noThreads = userThreads.length === 0;

  const handleThreadClick = (threadId: string) => {
    push(`/threads/${threadId}`);
  };

  // Callback function to refresh user threads
  const refreshThreads = useCallback(async () => {
    const visitorId = await loadFingerprint();

    try {
      const response = await getUserMessages(visitorId);
      if (response.error) {
        setError(response.error);
      } else {
        setUserThreads(response.threads ?? []);
      }
    } catch (err) {
      setError('Fetching threads failed');
      logger.error(err);
    }
  }, []);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  return (
    <>
      <SidebarLayout
        navbar={<Navbar />}
        sidebar={
          <div className="flex flex-col h-full">
            <SidebarHeader>
              <div className="flex justify-between items-center">
                <Logo />
                <NavHeader />
              </div>
            </SidebarHeader>
            <SidebarBody>
              <SidebarSection>
                {!noThreads && (
                  <div className="flex items-center cursor-pointer ml-2 mb-2 gap-2 text-lg">
                    <ChatConversation />
                    <SidebarLabel>Historia konwersacji</SidebarLabel>
                  </div>
                )}
                {userThreads.map((thread) => (
                  <SidebarItem
                    key={thread.id}
                    onClick={() => handleThreadClick(thread.public_id)}
                  >
                    {thread.messages[0].content}
                  </SidebarItem>
                ))}
              </SidebarSection>
            </SidebarBody>
            <SidebarFooter className="mb-10">
              <SidebarSection>
                <SidebarItem>
                  <LogoutIcon />
                  <SidebarLabel>
                    <UserLinks />
                  </SidebarLabel>
                </SidebarItem>
              </SidebarSection>
            </SidebarFooter>
          </div>
        }
      >
        {children}
      </SidebarLayout>
    </>
  );
};
