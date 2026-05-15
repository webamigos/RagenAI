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
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/40">
      <p className="text-sm text-indigo-900 dark:text-indigo-200">
        {t('invited-to')}{' '}
        <span className="font-semibold">{organizationName}</span>
      </p>
      <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
        {t('subtitle')}
      </p>
    </div>
  );
}
