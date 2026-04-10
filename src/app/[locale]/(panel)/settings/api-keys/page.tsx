import { getTranslations } from 'next-intl/server';
import { getApiKeys, getProjects } from './actions';
import { ApiKeysList } from './components/ApiKeysList';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-api-keys.title') };
}

export default async function ApiKeysSettingsPage() {
  const t = await getTranslations('api-keys');
  const [keys, projects] = await Promise.all([getApiKeys(), getProjects()]);

  return (
    <div className="max-w-4xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h2>
      </section>
      <ApiKeysList initialKeys={keys} projects={projects} />
    </div>
  );
}
