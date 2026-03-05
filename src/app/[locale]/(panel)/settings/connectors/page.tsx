import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-connectors.title') };
}

export default async function ConnectorsSettingsPage() {
  const t = await getTranslations('settings-page.connectors');

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
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {t('no-connectors')}
      </div>
    </div>
  );
}
