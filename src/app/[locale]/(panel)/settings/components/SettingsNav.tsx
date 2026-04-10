'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import {
  Cog6ToothIcon,
  UserIcon,
  PuzzlePieceIcon,
  BuildingOfficeIcon,
  AdjustmentsHorizontalIcon,
  CreditCardIcon,
  UserGroupIcon,
  KeyIcon,
  UsersIcon,
  CpuChipIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { useUser, useOrganization } from '@/app/hooks/use-auth';

const iconClassName = 'size-4 shrink-0';

type Permission = 'user' | 'orgAdmin' | 'appAdmin';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  permission: Permission;
};

const navItems: NavItem[] = [
  {
    href: '/settings/general',
    labelKey: 'general',
    icon: <Cog6ToothIcon className={iconClassName} />,
    permission: 'user',
  },
  {
    href: '/settings/account',
    labelKey: 'account',
    icon: <UserIcon className={iconClassName} />,
    permission: 'user',
  },
  {
    href: '/settings/connectors',
    labelKey: 'connectors',
    icon: <PuzzlePieceIcon className={iconClassName} />,
    permission: 'user',
  },
  {
    href: '/settings/organization-profile',
    labelKey: 'organization',
    icon: <BuildingOfficeIcon className={iconClassName} />,
    permission: 'orgAdmin',
  },
  {
    href: '/settings/prompt-management',
    labelKey: 'assistant-settings',
    icon: <AdjustmentsHorizontalIcon className={iconClassName} />,
    permission: 'orgAdmin',
  },
  {
    href: '/settings/subscription',
    labelKey: 'subscription',
    icon: <CreditCardIcon className={iconClassName} />,
    permission: 'orgAdmin',
  },
  {
    href: '/settings/teams',
    labelKey: 'teams',
    icon: <UserGroupIcon className={iconClassName} />,
    permission: 'orgAdmin',
  },
  {
    href: '/settings/api-keys',
    labelKey: 'api-keys',
    icon: <KeyIcon className={iconClassName} />,
    permission: 'orgAdmin',
  },
  {
    href: '/settings/users',
    labelKey: 'users',
    icon: <UsersIcon className={iconClassName} />,
    permission: 'appAdmin',
  },
  {
    href: '/settings/ai-usage',
    labelKey: 'ai-usage',
    icon: <CpuChipIcon className={iconClassName} />,
    permission: 'orgAdmin',
  },
  {
    href: '/settings/disk-usage',
    labelKey: 'disk-usage',
    icon: <CircleStackIcon className={iconClassName} />,
    permission: 'orgAdmin',
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations('settings-page.nav');
  const { isAppAdmin } = useUser();
  const { isOrgAdmin } = useOrganization();

  const visibleItems = navItems.filter((item) => {
    if (isAppAdmin) {
      return true;
    }
    if (item.permission === 'orgAdmin') {
      return isOrgAdmin;
    }
    return item.permission === 'user';
  });

  return (
    <nav className="flex flex-col gap-0.5">
      {visibleItems.map((item) => {
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
