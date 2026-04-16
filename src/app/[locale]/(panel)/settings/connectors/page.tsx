import { getTranslations } from 'next-intl/server';
import { PUBLIC_PROVIDER_LIST } from '@/features/connectors/providers/registry';
import { getConnectors } from './actions';
import { ConnectorsList } from './components/ConnectorsList';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-connectors.title') };
}

export default async function ConnectorsSettingsPage() {
  const t = await getTranslations('settings-page.connectors');
  const connectors = await getConnectors();

  return (
    <div className="max-w-2xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('description')}
        </p>
      </section>
      <ConnectorsList
        providers={PUBLIC_PROVIDER_LIST}
        connectors={connectors}
      />
    </div>
  );
}
