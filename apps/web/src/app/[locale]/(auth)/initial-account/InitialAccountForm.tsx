'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { z } from 'zod';

import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { signIn, signUp } from '@/app/hooks/use-better-auth';
import { updateInitialAdminAccountCommand } from '@/features/users/services/commands/initial-account-commands';
import { finalizeOnboardingCommand as finalizeUserOnboarding } from '@/features/onboarding/services/commands/finalize-onboarding-command';
import { hardNavigate } from '@/libs/navigation/hard-navigate';

const initialAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'initial-account.validation.name'),
    organizationName: z
      .string()
      .trim()
      .min(1, 'initial-account.validation.organization-name'),
    email: z.email('initial-account.validation.email'),
    password: z.string().min(8, 'initial-account.validation.password'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    // The error surfaces on the confirmPassword field so the user sees
    // it next to the input they can fix (retyping the confirm, not
    // changing the original).
    path: ['confirmPassword'],
    message: 'initial-account.validation.confirm-password-mismatch',
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
    const { email, password, name, organizationName } = data;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signUp.email({
        email,
        password,
        name,
      });

      if (result.error) {
        setError(result.error.message || t('error'));
        return;
      }

      if (!result.data?.user?.id) {
        setError(t('error'));
        return;
      }

      // The user id is read from the session server-side, not passed in — see
      // updateInitialAdminAccountCommand.
      const adminResult =
        await updateInitialAdminAccountCommand(organizationName);

      if (!adminResult.success) {
        setError(adminResult.error || t('error'));
        return;
      }

      // Sign in explicitly rather than assuming sign-up left a session.
      // `auth.ts` requires email verification on any production build, and
      // Better Auth issues no session for a sign-up awaiting it — which is
      // what made this screen a dead end. The promotion above has just marked
      // the address verified, so this now succeeds; if it somehow does not,
      // the account is still correctly set up and the sign-in page is the
      // right place to land.
      const signedIn = await signIn.email({ email, password });

      if (signedIn.error) {
        hardNavigate(locale, '/sign-in');
        return;
      }

      try {
        await finalizeUserOnboarding();
      } catch {
        // Continue anyway - account configuration will handle it
      }

      hardNavigate(locale, '/');
    } catch {
      setError(t('error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        {...register('name')}
        label={t('name')}
        error={errors.name}
        errorMessage={errors.name?.message}
      />
      <Input
        type="text"
        {...register('organizationName')}
        label={t('organization-name')}
        error={errors.organizationName}
        errorMessage={errors.organizationName?.message}
      />
      <Input
        type="email"
        {...register('email')}
        label="Email"
        error={errors.email}
        errorMessage={errors.email?.message}
      />
      <Input
        type="password"
        {...register('password')}
        label={t('password')}
        error={errors.password}
        errorMessage={errors.password?.message}
      />
      <Input
        type="password"
        {...register('confirmPassword')}
        label={t('confirm-password')}
        error={errors.confirmPassword}
        errorMessage={errors.confirmPassword?.message}
      />
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      <Button
        type="submit"
        className="mt-4 flex w-full justify-center rounded-md bg-brand-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        isLoading={isSubmitting}
        isSubmit={true}
      >
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
