import {
  useUser,
  SignedIn,
  SignInButton,
  SignOutButton,
  SignedOut,
} from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

export const UserLinks = () => {
  // const { user } = useUser();
  const t = useTranslations();

  return (
    <div className="ml-2">
      <SignedIn>
        <div>
          <SignOutButton>
            <span className="text-slate-300 cursor-pointer">
              {t('common.sign-out')}
            </span>
          </SignOutButton>
        </div>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="redirect">
          <span className="text-slate-300 cursor-pointer">
            {t('common.sign-in')}
          </span>
        </SignInButton>
      </SignedOut>
    </div>
  );
};
