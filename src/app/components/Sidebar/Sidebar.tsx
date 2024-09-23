'use client';

import { SidebarBody } from '@salesyy/common-ui';
import { SidebarLayout } from '@salesyy/common-ui';
import { Navbar } from '@salesyy/common-ui';
import { usePathname } from 'next/navigation';

import { UserThreadsHistory } from './ThreadsHistory/UserThreadsHistory';
import { Header } from './Header';
import { useSidebarLogic } from './useSidebarLogic';
import { Footer } from './Footer';
import { SidebarProvider } from '@/context/SidebarContext';

type Props = {
  children: React.ReactNode;
};

export const Sidebar = ({ children }: Props) => {
  const {
    error,
    hasMore,
    userEmail,
    isLoading,
    userAvatar,
    isSignedIn,
    userThreads,
    activeThread,
    handleThreadClick,
  } = useSidebarLogic();
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <SidebarLayout
        navbar={<Navbar />}
        sidebar={
          <div className="flex flex-col h-full text-sm">
            <Header />
            <SidebarBody>
              {pathname.includes('admin') ? (
                <div />
              ) : (
                <UserThreadsHistory
                  error={error}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  userThreads={userThreads}
                  activeThread={activeThread}
                  handleThreadClick={handleThreadClick}
                />
              )}
            </SidebarBody>
            <Footer
              userAvatar={userAvatar}
              isSignedIn={isSignedIn}
              userEmail={userEmail}
            />
          </div>
        }
      >
        {children}
      </SidebarLayout>
    </SidebarProvider>
  );
};
