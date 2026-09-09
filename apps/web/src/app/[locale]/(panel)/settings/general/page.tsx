import { getTranslations } from 'next-intl/server';
import { ThemeSelector } from './components/ThemeSelector';
import { LocaleSwitcher } from './components/LocaleSwitcher';
import { VoiceSettings } from './components/VoiceSettings';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-general.title') };
}

export default async function GeneralSettingsPage() {
  const t = await getTranslations('settings-page.general');

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-base font-semibold text-foreground dark:text-white">
          {t('appearance')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('appearance-description')}
        </p>
        <div className="mt-4">
          <ThemeSelector />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground dark:text-white">
          {t('language')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('language-description')}
        </p>
        <div className="mt-4">
          <LocaleSwitcher />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground dark:text-white">
          {t('voice')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('voice-description')}
        </p>
        <div className="mt-4">
          <VoiceSettings />
        </div>
      </section>
    </div>
  );
}
