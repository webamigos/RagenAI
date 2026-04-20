'use client';

import { useState } from 'react';
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
  const [error, setError] = useState(invalid);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);

    const result = await verifyPublicLinkPasswordAction(publicId, password);

    if (result.valid) {
      router.refresh();
    } else {
      setError(true);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-light dark:bg-primary-dark">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-white">
          {t('password-required')}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('password-description')}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder={t('password-placeholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {t('password-invalid')}
            </p>
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
