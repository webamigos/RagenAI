import { getTranslations } from 'next-intl/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getAvailableConnectorsForOrg } from '@/features/connectors/services/queries/get-available-connectors-query';
import { toPublicProviderDto } from '@/features/connectors/providers/registry';
import { getConnectors } from './actions';
import { ConnectorsList } from './components/ConnectorsList';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-connectors.title') };
}

export default async function ConnectorsSettingsPage() {
  const t = await getTranslations('settings-page.connectors');
  const orgId = await getOrgIdFromAuthOrThrow();
  const [providers, connectors] = await Promise.all([
    getAvailableConnectorsForOrg(orgId),
    getConnectors(),
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </section>
      <ConnectorsList
        providers={providers.map(toPublicProviderDto)}
        connectors={connectors}
      />
    </div>
  );
}
