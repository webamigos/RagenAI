import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

import {
  SettingsIcon,
  Avatar,
  Text,
  PencilSquareIcon,
  HomeIcon,
} from '@salesyy/common-ui';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ThemeSwitcher } from '../Theme';

type Props = {
  userAvatar?: string;
  userEmail?: string;
};

export const DesktopNavbar = ({ userAvatar, userEmail }: Props) => {
  const t = useTranslations('');
  const pathname = usePathname();

  const isMyProfile = pathname.includes('/my-profile');

  return (
    <div className="flex justify-end content-center font-sans">
      <div className="bg-white dark:bg-secondary-dark flex items-center mt-4 lg:mt-2 gap-4 bg-white dark:bg-secondary-dark rounded-3xl shadow-md p-1">
        <Avatar className="w-10 h-10 ml-1 sm:flex hidden" src={userAvatar} />
        <div className="flex flex-col items-start mx-3 hidden sm:flex">
          <Text
            fontSize="sm"
            className="text-primary-blue-500 dark:text-gray-500"
          >
            {t('Welcome')}
          </Text>
          <Text fontSize="sm">{userEmail?.split('@')[0] || 'User'}</Text>
        </div>
        <button className="rounded-full border p-2 dark:border-accent-dark-700 hover:bg-primary-gray-200 dark:hover:bg-accent-dark-700 sm:hidden">
          <PencilSquareIcon className="w-6 h-6" />
        </button>
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
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>
    </div>
  );
};
