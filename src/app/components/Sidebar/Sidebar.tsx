'use client';

import {
  SidebarBody,
  SidebarLayout,
  Navbar,
  Text,
  ArrowPath,
  Button,
  SidebarItem,
} from '@salesyy/common-ui';
import { usePathname } from 'next/navigation';

import { UserThreadsHistory } from './ThreadsHistory/UserThreadsHistory';
import { Header } from './Header';
import { useSidebarLogic } from './useSidebarLogic';
import { Footer } from './Footer';
import { SidebarProvider } from '@/context/SidebarContext';
import { ProfileAndOrganizationTabs } from './MyProfileSection';
import { OrganizationRoles } from '@/app/contracts/User';
import { PencilSquareIcon } from '@heroicons/react/24/outline';

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
    handleThread,
    refetchThreads,
    isThreadsLoaded,
    handleThreadClick,
  } = useSidebarLogic();
  const pathname = usePathname();
  const isError = error ? true : false;

  return (
    <SidebarProvider>
      <SidebarLayout
        navbar={<Navbar />}
        sidebar={
          <div className="flex w-full flex-col h-full text-sm">
            <Header />
            <SidebarItem onClick={handleThread} className="flex mx-2 mb-3">
              <PencilSquareIcon className="w-6 h-6" />
              <Text className="-ml-1 mt-1" color="gray-700" fontWeight="normal">
                Utwórz nowy wątek
              </Text>
            </SidebarItem>
            <SidebarBody className="-mt-3.5">
              {pathname === `/${locale}` || pathname.includes('threads') ? (
                error ? (
                  <div className="flex flex-col items-center text-start">
                    <Text color="red-500">{error}</Text>
                    <Button isError={isError} onClick={refetchThreads}>
                      <ArrowPath />
                    </Button>
                  </div>
                ) : (
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
                )
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
