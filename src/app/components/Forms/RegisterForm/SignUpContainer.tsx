'use client';

import { useState } from 'react';
import { RegisterForm } from './RegisterForm';
import { SocialAuthOptions } from '../../SocialAuthOptions';
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
