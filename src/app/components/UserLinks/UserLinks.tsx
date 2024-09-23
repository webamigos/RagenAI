import {
  SignedIn,
  SignInButton,
  SignOutButton,
  SignedOut,
} from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

export const UserLinks = () => {
  const t = useTranslations();

  return (
    <div className="ml-2">
      <SignedIn>
        <div>
          <SignOutButton>
            <span className="text-sm dark:text-slate-200 text-slate-900 cursor-pointer">
              {t('common.sign-out')}
            </span>
          </SignOutButton>
        </div>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="redirect">
          <span className="text-sm dark:text-slate-200 text-slate-900 cursor-pointer">
            {t('common.sign-in')}
          </span>
        </SignInButton>
      </SignedOut>
    </div>
  );
};
