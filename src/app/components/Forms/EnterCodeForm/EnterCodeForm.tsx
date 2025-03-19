'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/routing';
import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { saveUserMetadata } from '@/app/actions';
import { Button, Card, Text, Link } from '@ragenai/common-ui';
import { Input } from '@ragenai/common-ui';
import { Logo } from '../../Logo';
import { statusToast } from '@/app/lib/utils/toast';

import { createVerificationSchema, type VerificationFormData } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const EnterCodeForm = () => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoaded, signUp, setActive } = useSignUp();

  const t = useTranslations('sign-up');
  const schema = createVerificationSchema(t);
  const { push } = useRouter();
  const { errorToast, successToast } = statusToast();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<VerificationFormData>({
    resolver: zodResolver(schema),
  });
  // const codeField = watch('email_code');
  const resendAvailable = signUp?.verifications.emailAddress.status;

  const onSubmit = async (data: VerificationFormData) => {
    if (!isLoaded || !signUp) {
      return;
    }
    setIsSubmitting(true);

    const { email_code } = data;
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: email_code,
      });

      if (completeSignUp.status === 'complete') {
        const metadata = {
          onboardingComplete: false,
          viewMode: 'list',
        };

        const { success } = await saveUserMetadata(
          completeSignUp.createdUserId as string,
          metadata
        );

        if (success) {
          await setActive({ session: completeSignUp.createdSessionId });
          push('/account-configuration');
        }
      }
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        const expiredCodeError = error.errors.find(
          (err) => err.code === 'expired_code'
        );
        if (!expiredCodeError) {
          setApiErrors(error.errors);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  const resendCode = async () => {
    if (!signUp) {
      return errorToast({ message: t('email_code.resend-not-available') });
    }

    setValue('email_code', '');

    try {
      await signUp.prepareEmailAddressVerification();
      return successToast({ message: t('email_code.verification-code-sent') });
    } catch {
      return errorToast({ message: t('email_code.resend-failed') });
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Text>{t('verification-code-hint')}</Text>
        <Input
          className="w-full px-3 py-2 border rounded-md"
          errorMessage={errors.email_code?.message}
          label={t('verification-code')}
          error={errors.email_code}
          type="text"
          id="email_code"
          {...register('email_code', {
            onChange: (e) => {
              // allow only numeric values
              const numericValue = e.target.value.replace(/\D/g, '');
              setValue('email_code', numericValue);
            },
          })}
        />
        <div>
          {resendAvailable && (
            <Link href="">
              <Text onClick={() => resendCode()}>{t('resend-code')}</Text>
            </Link>
          )}
        </div>
        <Button
          className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          isLoading={isSubmitting}
          label={t('confirm')}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
      </form>
    </div>
  );
};
