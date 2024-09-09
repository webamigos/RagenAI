'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { saveUserIdToClerk } from '@/app/actions';
import { loadFingerprint } from '@/app/lib/utils/fingerprint';
import { Button, Card } from '@salesyy/common-ui';
import { Input } from '@salesyy/common-ui';

import { type ClerkAPIError } from '@clerk/types';
import {
  type VerificationFormData,
  verificationSchema,
} from '../../../components/RegisterForm/schema';

export default function EnterCodePage() {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[] | undefined>([]);
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
        await saveUserIdToClerk(completeSignUp.id as string, visitorId);
        await setActive({ session: completeSignUp.createdSessionId });
        push('/');
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
        <div>
          <label htmlFor="email_code" className="block mb-1">
            {t('Verification-code')}
          </label>
          <Input
            type="text"
            id="email_code"
            {...register('email_code')}
            className="w-full px-3 py-2 border rounded"
          />
          {errors.email_code && (
            <p className="text-red-500">{errors.email_code.message}</p>
          )}
        </div>
        {apiErrors && apiErrors.length > 0 && (
          <ul className="mb-2 text-red-500 text-sm">
            {apiErrors.map((error, index) => (
              <li key={index}>{error.longMessage || error.message}</li>
            ))}
          </ul>
        )}
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex justify-center items-center"
          isLoading={isSubmitting}
          label={t('confirm')}
          type="submit"
        />
      </form>
    </Card>
  );
}
