'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import {
  Cog6ToothIcon,
  UserIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

const iconClassName = 'size-4 shrink-0';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    href: '/settings/general',
    labelKey: 'general',
    icon: <Cog6ToothIcon className={iconClassName} />,
  },
  {
    href: '/settings/account',
    labelKey: 'account',
    icon: <UserIcon className={iconClassName} />,
  },
  {
    href: '/settings/connectors',
    labelKey: 'connectors',
    icon: <PuzzlePieceIcon className={iconClassName} />,
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations('settings-page.nav');

  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.href}
            href={item.href}
            className={classMerge(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-white'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-white',
            )}
          >
            {item.icon}
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
