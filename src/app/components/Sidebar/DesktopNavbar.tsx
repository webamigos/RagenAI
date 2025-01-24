import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { Link } from '@/i18n/routing';

import { SettingsIcon, PencilSquareIcon, HomeIcon } from '@ragenai/common-ui';
import { useNewThread } from '@/app/hooks/useNewThread';

import { LanguageSwitcher } from '../LanguageSwitcher';
import { ThemeSwitcher } from '../Theme';
import { UserMenu } from './UserMenu';

type Props = {
  userAvatar?: string;
  userEmail?: string;
};

export const DesktopNavbar = ({ userAvatar, userEmail }: Props) => {
  const t = useTranslations();
  const pathname = usePathname();

  const { handleNewThread } = useNewThread();
  const isMyProfile =
    pathname.includes('/my-profile') || pathname.includes('/manage-knowledge');

  return (
    <>
      {userEmail && (
        <div className="lg:fixed flex justify-end content-center font-sans z-50">
          <div className="bg-white dark:bg-secondary-dark flex items-center mt-4 lg:mt-2 gap-4 rounded-3xl shadow-md p-1">
            {pathname !== '/' && !pathname.includes('threads') && (
              <button
                onClick={handleNewThread}
                className="rounded-full border p-2 dark:border-accent-dark-700 hover:bg-primary-gray-200 dark:hover:bg-accent-dark-700"
              >
                <PencilSquareIcon className="w-6 h-6" />
              </button>
            )}
            {!isMyProfile && (
              <Link
                href={'/my-profile'}
                className="rounded-full border p-2 dark:border-accent-dark-700 hover:bg-primary-gray-200 dark:hover:bg-accent-dark-700"
                data-testid="home-or-settings-button"
              >
                <SettingsIcon
                  data-testid="settings-icon"
                  className="h-6 w-6 m-0.5 dark:text-gray-400"
                />
              </Link>
            )}
            <ThemeSwitcher />
            <LanguageSwitcher />
            <UserMenu userAvatar={userAvatar} userEmail={userEmail} />
          </div>
        </div>
      )}
    </>
  );
};
