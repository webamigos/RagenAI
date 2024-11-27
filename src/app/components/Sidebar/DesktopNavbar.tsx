import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import {
  SettingsIcon,
  Avatar,
  Text,
  PencilSquareIcon,
  HomeIcon,
} from '@ragenai/common-ui';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ThemeSwitcher } from '../Theme';

type Props = {
  userAvatar?: string;
  userEmail?: string;
};

export const DesktopNavbar = ({ userAvatar, userEmail }: Props) => {
  const t = useTranslations('Index');
  const pathname = usePathname();

  const isMyProfile =
    pathname.includes('/my-profile') || pathname.includes('/manage-knowledge');

  return (
    <>
      {userEmail && (
        <div className="lg:fixed flex justify-end content-center font-sans z-50">
          <div className="bg-white dark:bg-secondary-dark flex items-center mt-4 lg:mt-2 gap-4 bg-white dark:bg-secondary-dark rounded-3xl shadow-md p-1 group">
            <LanguageSwitcher className="ml-1" />
            <ThemeSwitcher />
            <a
              href={isMyProfile ? '/' : '/my-profile'}
              className="rounded-full border p-1.5 dark:border-accent-dark-700 hover:bg-primary-gray-200 dark:hover:bg-accent-dark-700"
            >
              {isMyProfile ? (
                <HomeIcon className="h-6 w-6 m-0.5" />
              ) : (
                <SettingsIcon className="h-6 w-6 m-0.5 dark:text-gray-400" />
              )}
            </a>
            <button className="rounded-full border p-2 dark:border-accent-dark-700 hover:bg-primary-gray-200 dark:hover:bg-accent-dark-700 sm:hidden">
              <PencilSquareIcon className="w-6 h-6" />
            </button>
            <div className="flex flex-col items-start hidden sm:flex max-w-0 overflow-hidden group-hover:max-w-[150px] group-hover:animate-slide-in transition-all duration-500">
              <Text
                fontSize="sm"
                className="text-primary-blue-500 dark:text-gray-500 whitespace-nowrap"
              >
                {t('welcome')}
              </Text>
              <Text fontSize="sm" className="mr-2 whitespace-nowrap">
                {userEmail?.split('@')[0] || 'User'}
              </Text>
            </div>
            <Avatar
              className="w-10 h-10 -ml-4 mr-1 sm:flex hidden"
              src={userAvatar}
            />
          </div>
        </div>
      )}
    </>
  );
};
