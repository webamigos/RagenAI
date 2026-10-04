import { getTranslations } from 'next-intl/server';
import {
  getApiKeyCreationAccess,
  getApiKeys,
  getAssistantsForKeyScope,
} from './actions';
import { ApiKeysList } from './components/ApiKeysList';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-api-keys.title') };
}

export default async function ApiKeysSettingsPage() {
  const t = await getTranslations('api-keys');
  const [keys, assistants, creation] = await Promise.all([
    getApiKeys(),
    getAssistantsForKeyScope(),
    getApiKeyCreationAccess(),
  ]);

  return (
    <div className="max-w-4xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.rich('description', {
            link: (chunks) => (
              <a
                href="https://docs.ragen.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
      <ApiKeysList
        initialKeys={keys}
        assistants={assistants}
        allowCreate={creation.allowed}
        demoAccount={creation.demoAccount}
      />
    </div>
  );
}
