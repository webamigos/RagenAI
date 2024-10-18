import { useTranslations } from 'next-intl';
import {
  SignedIn,
  SignInButton,
  SignOutButton,
  SignedOut,
} from '@clerk/nextjs';
import { LogoutIcon } from '@salesyy/common-ui/icons';
import { Text } from '@salesyy/common-ui/Text';

export const UserLinks = () => {
  const t = useTranslations();

  return (
    <div className="ml-2">
      <SignedIn>
        <div>
          <SignOutButton>
            <Text>
              <span className="flex font-sans text-sm font-semibold text-gray-500 hover:text-gray-600 dark:text-slate-200   cursor-pointer">
                <LogoutIcon className="-ml-2 mr-2" />
                {t('common.sign-out')}
              </span>
            </Text>
          </SignOutButton>
        </div>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="redirect">
          <span className="flex text-sm dark:text-slate-200 text-slate-900 cursor-pointer">
            <LogoutIcon className="mr-4" />
            {t('common.sign-in')}
          </span>
        </SignInButton>
      </SignedOut>
    </div>
  );
};
