'use client';

import { RegisterForm } from './RegisterForm';
import { ForgotPasswordLink } from '../ForgotPasswordLink';

type SignUpContainerProps = {
  forgotPasswordLabel: string;
};

export const SignUpContainer = ({
  forgotPasswordLabel,
}: SignUpContainerProps) => {
  return (
    <>
      <RegisterForm />
      <ForgotPasswordLink label={forgotPasswordLabel} />
    </>
  );
};
