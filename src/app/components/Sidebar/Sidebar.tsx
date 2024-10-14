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
import { ProfileAndOrganizationTabs } from './MyProfileSection';
import { OrganizationRoles } from '@/app/contracts/User';

type Props = {
  children: React.ReactNode;
  membership?: OrganizationRoles;
};

export const Sidebar = ({ children, membership }: Props) => {
  const {
    error,
    locale,
    hasMore,
    userEmail,
    isLoading,
    userAvatar,
    isSignedIn,
    userThreads,
    activeThread,
    isThreadsLoaded,
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
              {pathname === `/${locale}` || pathname.includes('threads') ? (
                <UserThreadsHistory
                  error={error}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  isSignedIn={isSignedIn}
                  userThreads={userThreads}
                  activeThread={activeThread}
                  isThreadsLoaded={isThreadsLoaded}
                  handleThreadClick={handleThreadClick}
                />
              ) : (
                <ProfileAndOrganizationTabs membership={membership} />
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
