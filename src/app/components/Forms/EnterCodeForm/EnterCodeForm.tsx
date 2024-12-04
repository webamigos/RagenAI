'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { useEffect, useState, useTransition } from 'react';
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
  const codeField = watch('email_code');
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
        const { success } = await saveUserMetadata(
          completeSignUp.createdUserId as string
        );

        if (success) {
          await setActive({ session: completeSignUp.createdSessionId });
          push('/');
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
    <Card>
      <div className="flex justify-center">
        <Logo />
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Text>{t('verification-code-hint')}</Text>
        <Input
          className="w-full px-3 py-2 border"
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
          className="w-full py-2.5 flex justify-center items-center"
          isLoading={isSubmitting}
          label={t('confirm')}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
      </form>
    </Card>
  );
};
