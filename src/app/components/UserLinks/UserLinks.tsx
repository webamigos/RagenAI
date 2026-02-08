import { useTranslations, useLocale } from 'next-intl';
import { useUser } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';

import { LogoutIcon, UserCircleIcon } from '@ragenai/common-ui/icons';

export const UserLinks = () => {
  const { isSignedIn } = useUser();
  const t = useTranslations();
  const locale = useLocale();

  return (
    <>
      {isSignedIn ? (
        <span
          onClick={async () => {
            await signOut();
            window.location.href = `/${locale}/sign-in`;
          }}
          className="flex font-sans text-sm font-semibold text-gray-500 hover:text-gray-600 dark:text-slate-200 dark:hover:text-white cursor-pointer"
        >
          <LogoutIcon className="mr-3" />
          {t('common.sign-out')}
        </span>
      ) : (
        <a href="/sign-in">
          <span className="flex text-sm dark:text-slate-200 text-slate-900 dark:hover:text-white cursor-pointer">
            <UserCircleIcon className="mr-3" />
            {t('common.sign-in')}
          </span>
        </a>
      )}
    </>
  );
};
