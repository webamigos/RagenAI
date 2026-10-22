'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { signIn } from '@/app/hooks/use-better-auth';
import { ssoErrorMessageKey } from '@/lib/oidc-errors';
import { finalizeOnboardingCommand as finalizeUserOnboarding } from '@/features/onboarding/services/commands/finalize-onboarding-command';

import { logger } from '@/app/lib/utils/logger';

import { type LoginFormData, loginSchema } from './schema';
import { hardNavigate } from '@/libs/navigation/hard-navigate';
import { DemoCredentialsNotice } from './DemoCredentialsNotice';

type LoginFormProps = {
  prefillEmail?: string;
  /**
   * Company sign-in (OIDC), when this install has it configured. Passed from
   * the server page rather than read here: the configuration is server-only,
   * and the client needs nothing from it but the name on the button.
   */
  sso?: { displayName: string };
};

/** The Better Auth provider id; see `src/lib/oidc-config.ts`. */
const SSO_PROVIDER_ID = 'oidc';

export const LoginForm = ({ prefillEmail, sso }: LoginFormProps = {}) => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = useTranslations('sign-in');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get('invitationId');
  const oauthQuery = searchParams.get('sig')
    ? searchParams.toString()
    : undefined;
  // A refused OIDC callback comes back here with `?error=<code>` — Better
  // Auth's own codes and the ones in `src/lib/oidc-errors.ts` — and each has
  // a sentence saying what happened.
  const ssoError = sso ? searchParams.get('error') : null;
  const ssoErrorKey = ssoErrorMessageKey(ssoError);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const signInWithSso = async () => {
    setIsRedirecting(true);
    setError(null);
    try {
      const result = await signIn.social({
        provider: SSO_PROVIDER_ID as never,
        callbackURL: `/${locale}/new`,
        errorCallbackURL: `/${locale}/sign-in`,
      });
      if (result?.error) {
        setError(result.error.message || t('sso-failed'));
        setIsRedirecting(false);
      }
    } catch {
      setError(t('sso-failed'));
      setIsRedirecting(false);
    }
  };

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: prefillEmail ? { email: prefillEmail } : undefined,
  });

  const onSubmit = async (data: LoginFormData) => {
    const { email, password } = data;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signIn.email({
        email,
        password,
      });

      if (result.error) {
        if (result.error.message === 'Email not verified') {
          setError(t('email-not-verified'));
        } else {
          setError(result.error.message || 'Sign in failed');
        }
        return;
      }

      const oauthRedirect = (result.data as { url?: string } | undefined)?.url;
      if (oauthQuery && oauthRedirect) {
        window.location.assign(oauthRedirect);
        return;
      }

      // Finalize user onboarding (set activeOrganizationId + trial subscription)
      try {
        await finalizeUserOnboarding();
      } catch (err) {
        logger.warn(
          { error: err },
          'Onboarding finalization failed, relying on fallback',
        );
        // Continue anyway - middleware/account-configuration will handle it
      }

      // If user came from invitation link, redirect to accept it
      if (invitationId) {
        hardNavigate(
          locale,
          `/accept-invitation?token=${encodeURIComponent(invitationId)}`,
        );
        return;
      }

      hardNavigate(locale, '/new');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {sso && (
        <div className="mb-6">
          <Button
            type="button"
            outline
            className="flex w-full justify-center"
            isLoading={isRedirecting}
            onClick={signInWithSso}
            data-testid="sign-in-sso"
          >
            {t('sso-sign-in', { name: sso.displayName })}
          </Button>
          {ssoErrorKey && (
            <p
              className="text-sm text-destructive mt-2"
              role="alert"
              data-testid="sign-in-sso-error"
              data-error={ssoError ?? undefined}
            >
              {t(ssoErrorKey)}
            </p>
          )}
          <p className="mt-6 text-center text-xs uppercase tracking-wide text-muted-foreground">
            {t('sso-or')}
          </p>
        </div>
      )}
      <DemoCredentialsNotice
        onFill={({ email, password }) => {
          setValue('email', email, { shouldValidate: true });
          setValue('password', password, { shouldValidate: true });
        }}
      />
      <Input
        type="email"
        id="email"
        {...register('email')}
        label="Email"
        readOnly={Boolean(prefillEmail)}
        error={errors.email}
        errorMessage={errors.email?.message}
      />
      <Input
        type="password"
        id="password"
        {...register('password')}
        label={t('Password')}
        error={errors.password}
        errorMessage={errors.password?.message}
      />
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      <Button
        type="submit"
        className="mt-4 flex w-full justify-center rounded-md bg-brand-600 px-3 py-1.5 text-sm/6 font-semibold text-primary-foreground shadow-xs hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        isLoading={isSubmitting}
        isSubmit={true}
        data-testid="sign-in-submit"
      >
        {t('sign-in')}
      </Button>
    </form>
  );
};
