'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { signUp } from '@/app/hooks/use-better-auth';
import { updateInitialAdminAccountCommand } from '@/features/users/services/commands/initial-account-commands';
import { finalizeOnboardingCommand as finalizeUserOnboarding } from '@/features/onboarding/services/commands/finalize-onboarding-command';

const initialAccountSchema = z.object({
  email: z.email('initial-account.validation.email'),
  password: z.string().min(8, 'initial-account.validation.password'),
});

type InitialAccountFormData = z.infer<typeof initialAccountSchema>;

export function InitialAccountForm() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = useTranslations('initial-account');
  const locale = useLocale();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InitialAccountFormData>({
    resolver: zodResolver(initialAccountSchema),
  });

  const onSubmit = async (data: InitialAccountFormData) => {
    const { email, password } = data;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signUp.email({
        email,
        password,
        name: 'Admin',
      });

      if (result.error) {
        setError(result.error.message || t('error'));
        return;
      }

      const userId = result.data?.user?.id;

      if (!userId) {
        setError(t('error'));
        return;
      }

      const adminResult = await updateInitialAdminAccountCommand(userId);

      if (!adminResult.success) {
        setError(adminResult.error || t('error'));
        return;
      }

      try {
        await finalizeUserOnboarding();
      } catch {
        // Continue anyway - account configuration will handle it
      }

      window.location.href = `/${locale}/`;
    } catch {
      setError(t('error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="email"
        id="email"
        {...register('email')}
        label="Email"
        error={errors.email}
        errorMessage={errors.email?.message}
      />
      <Input
        type="password"
        id="password"
        {...register('password')}
        label={t('password')}
        error={errors.password}
        errorMessage={errors.password?.message}
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-500 mt-2">{error}</p>
      )}
      <Button
        type="submit"
        className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        isLoading={isSubmitting}
        isSubmit={true}
      >
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
