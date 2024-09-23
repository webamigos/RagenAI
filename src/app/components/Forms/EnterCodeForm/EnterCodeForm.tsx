'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { loadFingerprint } from '@/app/lib/utils/fingerprint';
import { saveUserIdToClerk } from '@/app/actions';
import { Button, Card } from '@salesyy/common-ui';
import { Input } from '@salesyy/common-ui';

import { type VerificationFormData, verificationSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const EnterCodeForm = () => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoaded, signUp, setActive } = useSignUp();

  const t = useTranslations('Sign-up');
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerificationFormData>({
    resolver: zodResolver(verificationSchema),
  });

  const onSubmit = async (data: VerificationFormData) => {
    if (!isLoaded) return;
    setIsSubmitting(true);
    const visitorId = await loadFingerprint();

    const { email_code } = data;
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: email_code,
      });

      if (completeSignUp.status === 'complete') {
        const { success } = await saveUserIdToClerk(
          completeSignUp.createdUserId as string,
          visitorId
        );

        if (success) {
          await setActive({ session: completeSignUp.createdSessionId });
          push('/');
        }
      }
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        setApiErrors(error.errors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          className="w-full px-3 py-2 border rounded"
          errorMessage={errors.email_code?.message}
          label={t('Verification-code')}
          error={errors.email_code}
          type="text"
          id="email_code"
          {...register('email_code')}
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex justify-center items-center"
          isLoading={isSubmitting}
          label={t('confirm')}
          type="submit"
        />
      </form>
    </Card>
  );
};
