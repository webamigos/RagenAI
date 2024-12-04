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
import Link from 'next/link';
import { UserButtonClerk } from './UserButton';

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
          <div className="bg-white dark:bg-secondary-dark flex items-center mt-4 lg:mt-2 gap-4 rounded-3xl shadow-md p-1">
            <LanguageSwitcher className="ml-1" />
            <ThemeSwitcher />
            <Link
              href={isMyProfile ? '/' : '/my-profile'}
              className="rounded-full border p-1.5 dark:border-accent-dark-700 hover:bg-primary-gray-200 dark:hover:bg-accent-dark-700"
              data-testid="home-or-settings-button"
            >
              {isMyProfile ? (
                <HomeIcon data-testid="home-icon" className="h-6 w-6 m-0.5" />
              ) : (
                <SettingsIcon
                  data-testid="settings-icon"
                  className="h-6 w-6 m-0.5 dark:text-gray-400"
                />
              )}
            </Link>
            <button className="rounded-full border p-2 dark:border-accent-dark-700 hover:bg-primary-gray-200 dark:hover:bg-accent-dark-700 sm:hidden">
              <PencilSquareIcon className="w-6 h-6" />
            </button>
            <UserButtonClerk />
          </div>
        </div>
      )}
    </>
  );
};
