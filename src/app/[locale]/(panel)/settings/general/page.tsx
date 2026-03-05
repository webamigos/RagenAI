import { getTranslations } from 'next-intl/server';
import { ThemeSelector } from './components/ThemeSelector';

export default async function GeneralSettingsPage() {
  const t = await getTranslations('settings-page.general');

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('appearance')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('appearance-description')}
        </p>
        <div className="mt-4">
          <ThemeSelector />
        </div>
      </section>
    </div>
  );
}
