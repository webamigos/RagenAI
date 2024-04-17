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
    <div>
      <SignedIn>
        <div>
          <SignOutButton>{t('common.sign-out')}</SignOutButton>
        </div>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="redirect">{t('common.sign-in')}</SignInButton>
      </SignedOut>
    </div>
  );
};
