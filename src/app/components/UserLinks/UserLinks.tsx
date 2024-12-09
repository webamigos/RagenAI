import { useTranslations } from 'next-intl';
import {
  SignedIn,
  SignInButton,
  SignOutButton,
  SignedOut,
} from '@clerk/nextjs';
import { useUser } from '@clerk/nextjs';

import { LogoutIcon, UserCircleIcon } from '@ragenai/common-ui/icons';

export const UserLinks = () => {
  const { isSignedIn } = useUser();
  const t = useTranslations();

  return (
    <div>
      {isSignedIn ? (
        <div>
          <SignOutButton>
            <button className="flex font-sans text-sm font-semibold text-gray-500 hover:text-gray-600 dark:text-slate-200 dark:hover:text-white cursor-pointer">
              <LogoutIcon className="mr-3" />
              {t('common.sign-out')}
            </button>
          </SignOutButton>
        </div>
      ) : (
        <SignInButton mode="redirect" aria-label="Open sign in">
          <span className="flex text-sm dark:text-slate-200 text-slate-900 dark:hover:text-white cursor-pointer">
            <UserCircleIcon className="mr-4" />
            {t('common.sign-in')}
          </span>
        </SignInButton>
      )}
    </div>
  );
};
