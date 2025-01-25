'use client';

import Link from 'next/link';

import {
  SidebarBody,
  SidebarLayout,
  Text,
  Button,
  SpinnerSVG,
  SearchIcon,
  ArrowPath,
  ArrowIcon,
} from '@ragenai/common-ui';
import { useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/routing';
import { UserThreadsHistory } from './ThreadsHistory/UserThreadsHistory';
import { Header } from './Header';
import { useSidebarLogic } from './useSidebarLogic';
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
    handleSearch,
    handleThread,
    refetchThreads,
    isThreadLoading,
    isThreadsLoaded,
    handleCloseThread,
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
          <div className="flex flex-col mb-5">
            {pathname === '/' ||
            pathname.includes('/threads') ||
            pathname === `/${locale}/support` ? (
              <Button
                isLink
                onClick={handleThread}
                className="relative ml-4 w-10/12"
              >
                <PencilSquareIcon className="w-6 h-6 dark:text-gray-200" />
                <Text
                  className="m-1 mt-1 dark:text-gray-100"
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
            ) : (
              <Link href={'/'}>
                <Button
                  isLink
                  onClick={() => handleCloseThread(true)}
                  className="relative ml-4 w-10/12"
                >
                  <ArrowIcon className="w-5 h-5 dark:text-gray-200" />
                  <Text
                    color="gray-700"
                    fontWeight="medium"
                    className="ml-3 dark:text-gray-100"
                  >
                    {t('return-to-home')}
                  </Text>
                </Button>
              </Link>
            )}
            {isSignedIn &&
              !pathname.includes('/my-profile') &&
              !pathname.includes('/manage-knowledge') &&
              !pathname.includes('generate-access-key') &&
              !pathname.includes('/support') && (
                <Button
                  onClick={handleSearch}
                  className="relative ml-4 w-10/12"
                  isLink
                >
                  <SearchIcon className="w-6 h-6 dark:text-gray-200" />
                  <Text className="ml-1">{t('search-threads')}</Text>
                </Button>
              )}
          </div>
          <SidebarBody className="-mt-3.5">
            {pathname === `/` || pathname.includes('threads') ? (
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
        </div>
      }
    >
      {children}
    </SidebarLayout>
  );
};
