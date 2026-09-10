'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import { useTranslations } from 'next-intl';
import type { SettingsPage } from '@/features/settings/registry';
import { SETTINGS_ICONS } from './settings-icons';

const iconClassName = 'size-4 shrink-0';

type Props = Readonly<{
  items: readonly SettingsPage[];
  variant?: 'sidebar' | 'tabs';
}>;

export function SettingsNav({ items, variant = 'sidebar' }: Props) {
  const pathname = usePathname();
  const t = useTranslations('settings-page.nav');

  if (variant === 'tabs') {
    return (
      <nav className="flex overflow-x-auto px-4">
        {items.map((item) => {
          const isActive =
            pathname === item.path || pathname.startsWith(item.path + '/');

          return (
            <Link
              key={item.id}
              href={item.path}
              className={classMerge(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors',
                isActive
                  ? 'border-border font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = SETTINGS_ICONS[item.icon];
        const isActive =
          pathname === item.path || pathname.startsWith(item.path + '/');

        return (
          <Link
            key={item.id}
            href={item.path}
            className={classMerge(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted/50',
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
