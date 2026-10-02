import { getTranslations } from 'next-intl/server';

import { getMemoryPageAction } from './actions';
import { MemorySettingsView } from './MemorySettingsView';

export async function generateMetadata() {
  const t = await getTranslations('settings-page.memory');
  return { title: t('title') };
}

export default async function MemorySettingsPage() {
  const t = await getTranslations('settings-page.memory');
  const data = await getMemoryPageAction();

  return (
    <div className="max-w-2xl space-y-6">
      <section>
        <h2 className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </section>
      <MemorySettingsView data={data} />
    </div>
  );
}
