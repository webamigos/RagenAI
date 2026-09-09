'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';

type Props = {
  email: string;
  temporaryPassword: string;
  onDone: () => void;
};

/**
 * The one and only time the generated password is visible.
 *
 * It is not stored anywhere readable, so closing this without copying it means
 * the administrator has to delete the account and make another — which is why
 * the dialog does not close on its own.
 */
export function CreatedAccountPanel({
  email,
  temporaryPassword,
  onDone,
}: Props) {
  const t = useTranslations('organization.members');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(
      `${t('email')}: ${email}\n${t('temporary-password')}: ${temporaryPassword}`,
    );
    setCopied(true);
  };

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('account-created-hint')}
      </p>

      <dl className="rounded-lg border border-border bg-muted p-4 text-sm dark:bg-card">
        <dt className="text-muted-foreground">{t('email')}</dt>
        <dd className="font-mono break-all text-foreground dark:text-white">
          {email}
        </dd>
        <dt className="mt-3 text-muted-foreground">
          {t('temporary-password')}
        </dt>
        <dd
          className="font-mono break-all text-foreground dark:text-white"
          data-testid="temporary-password"
        >
          {temporaryPassword}
        </dd>
      </dl>

      <p className="text-xs text-pending">{t('temporary-password-warning')}</p>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={copy} outline>
          {copied ? t('copied') : t('copy-credentials')}
        </Button>
        <Button type="button" onClick={onDone}>
          {t('done')}
        </Button>
      </div>
    </div>
  );
}
