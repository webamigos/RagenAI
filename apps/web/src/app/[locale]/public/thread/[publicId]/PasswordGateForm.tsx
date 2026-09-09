'use client';

import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { verifyPublicLinkPasswordAction } from '@/app/actions/thread-public-links';

type Props = {
  publicId: string;
  invalid?: boolean;
};

export function PasswordGateForm({ publicId, invalid = false }: Props) {
  const t = useTranslations('public-thread');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(invalid);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);

    try {
      const result = await verifyPublicLinkPasswordAction(publicId, password);
      if (result.valid) {
        router.refresh();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-white p-6 shadow-sm dark:bg-card">
        <h1 className="text-lg font-semibold text-foreground dark:text-white">
          {t('password-required')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('password-description')}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('password-placeholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-muted-foreground/90"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeSlashIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>
          {error && (
            <p className="text-sm text-destructive">{t('password-invalid')}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password}
          >
            {isLoading ? t('password-verifying') : t('password-submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
