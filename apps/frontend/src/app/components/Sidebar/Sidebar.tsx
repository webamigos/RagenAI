'use client';

import { SidebarBody } from '@salesyy/common-ui';
import { SidebarLayout } from '@salesyy/common-ui';
import { Navbar } from '@salesyy/common-ui';

import { UserThreadsHistory } from './UserThreadsHistory';
import { Header } from './Header';
import { useSidebarLogic } from './useSidebarLogic';
import { Footer } from './Footer';

type Props = {
  children: React.ReactNode;
};

export const Sidebar = ({ children }: Props) => {
  const {
    error,
    userEmail,
    isLoading,
    noThreads,
    isSignedIn,
    userThreads,
    handleThreadClick,
  } = useSidebarLogic();

  return (
    <SidebarLayout
      navbar={<Navbar />}
      sidebar={
        <div className="flex flex-col h-full">
          <Header />
          <SidebarBody>
            <UserThreadsHistory
              error={error}
              isLoading={isLoading}
              noThreads={noThreads}
              userThreads={userThreads}
              handleThreadClick={handleThreadClick}
            />
          </SidebarBody>
          <Footer isSignedIn={isSignedIn} userEmail={userEmail} />
        </div>
      }
    >
      {children}
    </SidebarLayout>
  );
};
