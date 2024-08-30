'use client';

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

import { Logo } from '../Logo';
import { NavHeader } from '../NavHeader';
import { UserLinks } from '../UserLinks';
import { UserThreadsHistory } from './UserThreadsHistory';
import { useSidebarLogic } from './useSidebarLogic';

type Props = {
  children: React.ReactNode;
};

export const Sidebar = ({ children }: Props) => {
  const {
    user,
    error,
    isLoading,
    noThreads,
    isSignedIn,
    userThreads,
    handleThreadClick,
  } = useSidebarLogic();

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
              <UserThreadsHistory
                error={error}
                isLoading={isLoading}
                noThreads={noThreads}
                userThreads={userThreads}
                handleThreadClick={handleThreadClick}
              />
            </SidebarBody>
            <SidebarFooter className="mb-10">
              <SidebarSection>
                <div className="flex justify-between items-center">
                  {isSignedIn && (
                    <SidebarLabel>
                      {user?.emailAddresses[0].emailAddress}
                    </SidebarLabel>
                  )}
                  <SidebarItem>
                    <LogoutIcon />
                    <SidebarLabel>
                      <UserLinks />
                    </SidebarLabel>
                  </SidebarItem>
                </div>
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
