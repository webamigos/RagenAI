import { getTranslations } from 'next-intl/server';
import { SettingsNav } from './components/SettingsNav';

type Props = Readonly<{
  children: React.ReactNode;
}>;

export default async function SettingsLayout({ children }: Props) {
  const t = await getTranslations('settings-page');

  return (
    <div className="flex min-h-full">
      <div className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-6">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-white mb-4">
          {t('title')}
        </h1>
        <SettingsNav />
      </div>
      <div className="flex-1 p-6 overflow-auto">{children}</div>
    </div>
  );
}
