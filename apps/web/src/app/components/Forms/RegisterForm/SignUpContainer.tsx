'use client';

import { RegisterForm } from './RegisterForm';
import { ForgotPasswordLink } from '../ForgotPasswordLink';
import { Link } from '@/i18n/routing';

type SignUpContainerProps = {
  forgotPasswordLabel: string;
  alreadyHaveAccountLabel: string;
  signInLabel: string;
  signInHref: string;
  prefillEmail?: string;
};

export const SignUpContainer = ({
  forgotPasswordLabel,
  alreadyHaveAccountLabel,
  signInLabel,
  signInHref,
  prefillEmail,
}: SignUpContainerProps) => {
  return (
    <>
      <RegisterForm prefillEmail={prefillEmail} />
      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="text-sm/6 dark:text-gray-300 text-gray-500">
          {alreadyHaveAccountLabel}{' '}
          <Link
            href={signInHref}
            className="font-semibold dark:text-brand-400 text-brand-600 hover:text-brand-700 dark:hover:text-brand-300"
          >
            {signInLabel}
          </Link>
        </p>
        <ForgotPasswordLink label={forgotPasswordLabel} className="" />
      </div>
    </>
  );
};
