import { getTranslations } from 'next-intl/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { getPiiIngestionMode } from '@/features/organizations/services/organization-settings';
import { PiiIngestionModeSwitch } from '@/app/components/settings/PiiIngestionModeSwitch';
import { PiiPolicyAccordion } from './PiiPolicyAccordion';

export async function generateMetadata() {
  const t = await getTranslations('pii-policy');
  return { title: t('info-page-title') };
}

export default async function PiiPolicySettingsPage() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const t = await getTranslations('pii-policy');
  const currentMode = await getPiiIngestionMode(orgId);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {t('info-page-title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('info-page-subtitle')}
        </p>
      </div>

      <section>
        {/* Desktop: table */}
        <div className="hidden sm:block overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('table-heading-policy')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('table-heading-masks')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('table-heading-examples')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              <tr>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {t('none-label')}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {t('none-masks')}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {t('none-examples')}
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {t('toxic-only-label')}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {t('toxic-only-masks')}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {t('toxic-only-examples')}
                </td>
              </tr>
              <tr>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {t('strict-label')}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {t('strict-masks')}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {t('strict-examples')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile: accordion */}
        <PiiPolicyAccordion
          rows={[
            {
              label: t('none-label'),
              masksHeading: t('table-heading-masks'),
              masks: t('none-masks'),
              examplesHeading: t('table-heading-examples'),
              examples: t('none-examples'),
            },
            {
              label: t('toxic-only-label'),
              masksHeading: t('table-heading-masks'),
              masks: t('toxic-only-masks'),
              examplesHeading: t('table-heading-examples'),
              examples: t('toxic-only-examples'),
            },
            {
              label: t('strict-label'),
              masksHeading: t('table-heading-masks'),
              masks: t('strict-masks'),
              examplesHeading: t('table-heading-examples'),
              examples: t('strict-examples'),
            },
          ]}
        />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
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
            <li key={key} className="flex gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-paper-400" />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <PiiIngestionModeSwitch initialMode={currentMode} />
      </section>
    </div>
  );
}
