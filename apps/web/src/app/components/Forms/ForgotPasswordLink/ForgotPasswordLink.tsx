import { Link } from '@/i18n/routing';

import { demoCredentials } from '@/libs/demo-credentials';

type Props = {
  label: string;
  className?: string;
};

/**
 * Hidden on a deployment that publishes a shared demo account.
 *
 * The password of that account is printed on the same screen, so "forgot
 * password?" offers a visitor nothing but a way to mail a reset link to an
 * address they do not own — and a demo whose one login can be changed by a
 * stranger is a demo that breaks for the next prospect. The refusal itself
 * lives server-side, in `lib/demo-account-lock.ts`; this only stops the
 * invitation.
 *
 * Gated on the credentials being published rather than on the signed-in
 * address, because the sign-in page has no session to key on — the same gate
 * `DemoCredentialsNotice` uses, and for the same reason. The consequence is
 * that a salesperson with their own login on the demo deployment loses the
 * link too; `/forgot-password` still works if they navigate to it, and their
 * reset is not refused.
 */
export const ForgotPasswordLink = ({ label, className }: Props) => {
  if (demoCredentials) {
    return null;
  }

  return (
    <div className={`flex w-full justify-center ${className ?? 'mt-6'}`}>
      <Link
        href="/forgot-password"
        className="text-sm font-normal dark:text-brand-400 text-brand-600 hover:text-brand-700 dark:hover:text-brand-300"
      >
        {label}
      </Link>
    </div>
  );
};
