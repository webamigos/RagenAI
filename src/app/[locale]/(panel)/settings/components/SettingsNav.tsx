'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import { useTranslations } from 'next-intl';
import type { SettingsPage } from '@/features/settings/registry';

const iconClassName = 'size-4 shrink-0';

type Props = Readonly<{
  items: readonly SettingsPage[];
}>;

export function SettingsNav({ items }: Props) {
  const pathname = usePathname();
  const t = useTranslations('settings-page.nav');

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.path || pathname.startsWith(item.path + '/');

        return (
          <Link
            key={item.id}
            href={item.path}
            className={classMerge(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-white'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-white',
            )}
          >
            <Icon className={iconClassName} />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
