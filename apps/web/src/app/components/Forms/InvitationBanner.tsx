import { getTranslations } from 'next-intl/server';

type Props = {
  organizationName: string;
};

/**
 * Banner shown above sign-in / sign-up forms when the user is following an
 * invitation link, so they know which org they're about to join.
 */
export async function InvitationBanner({ organizationName }: Props) {
  const t = await getTranslations('invitation-banner');
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/40">
      <p className="text-sm text-brand-900 dark:text-brand-200">
        {t('invited-to')}{' '}
        <span className="font-semibold">{organizationName}</span>
      </p>
      <p className="mt-1 text-xs text-brand-700 dark:text-brand-300">
        {t('subtitle')}
      </p>
    </div>
  );
}
