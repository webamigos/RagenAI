import { getTranslations } from 'next-intl/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-general.title') };
}

export default async function PiiPolicySettingsPage() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const t = await getTranslations('pii-policy');

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('info-page-title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('info-page-subtitle')}
        </p>
      </div>

      <section>
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('table-heading-policy')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('table-heading-masks')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('table-heading-examples')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-700 dark:bg-zinc-900">
              <tr>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {t('none-label')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('none-masks')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('none-examples')}
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {t('toxic-only-label')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('toxic-only-masks')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('toxic-only-examples')}
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {t('strict-label')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('strict-masks')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('strict-examples')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-white">
          {t('data-section-title')}
        </h3>
        <ul className="space-y-2">
          {(
            [
              'data-local-processing',
              'data-vector-store',
              'data-policy-change',
              'data-isolation',
            ] as const
          ).map((key) => (
            <li
              key={key}
              className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-400"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-zinc-400" />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
