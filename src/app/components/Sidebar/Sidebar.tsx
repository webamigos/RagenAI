'use client';

import {
  SidebarBody,
  SidebarLayout,
  Text,
  Button,
  SpinnerSVG,
} from '@ragenai/common-ui';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { UserThreadsHistory } from './ThreadsHistory/UserThreadsHistory';
import { Header } from './Header';
import { useSidebarLogic } from './useSidebarLogic';
import { Footer } from './Footer';
import { ProfileAndOrganizationTabs } from './MyProfileSection';
import { OrganizationRoles } from '@/app/contracts/User';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { DesktopNavbar } from './DesktopNavbar';

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
    isThreadLoading,
    isThreadsLoaded,
    getSidebarThreadsError,
  } = useSidebarLogic();
  const pathname = usePathname();
  const isError = error ? true : false;
  const t = useTranslations('sidebar');

  return (
    <SidebarLayout
      navbar={<DesktopNavbar userEmail={userEmail} userAvatar={userAvatar} />}
      sidebar={
        <div className="flex w-full flex-col h-full text-sm">
          <Header />
          <div className="flex">
            <Button
              isLink
              onClick={handleThread}
              className="relative ml-4 mb-5 w-10/12"
            >
              <PencilSquareIcon className="w-6 h-6 dark:text-gray-200" />
              <Text
                className="ml-1 mt-1 dark:text-gray-100"
                color="gray-700"
                fontWeight="normal"
              >
                {t('create-new-thread')}
              </Text>
              {isThreadLoading && (
                <SpinnerSVG
                  size="sm"
                  className="absolute right-24 bottom-2.5"
                />
              )}
            </Button>
          </div>
          <SidebarBody className="-mt-3.5">
            {pathname === `/${locale}` || pathname.includes('threads') ? (
              error ? (
                <div className="flex flex-col items-center text-start">
                  <Text color="red-500">{getSidebarThreadsError(error)}</Text>
                  <Button isError={isError} onClick={refetchThreads} />
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
                />
              )
            ) : (
              <ProfileAndOrganizationTabs membership={membership} />
            )}
          </SidebarBody>
          <Footer />
        </div>
      }
    >
      {children}
    </SidebarLayout>
  );
};
