'use client';

import { usePathname, Link } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import {
  BuildingOfficeIcon,
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  UserGroupIcon,
  KeyIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  CircleStackIcon,
  PuzzlePieceIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

const iconClassName = 'size-4 shrink-0';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
};

const isStripeEnabled = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

const navItems: NavItem[] = [
  {
    href: '/organization/assistant-settings',
    labelKey: 'settings',
    icon: <AdjustmentsHorizontalIcon className={iconClassName} />,
  },
  {
    href: '/organization/rag-settings',
    labelKey: 'rag-settings',
    icon: <BeakerIcon className={iconClassName} />,
  },
  {
    href: '/organization/profile',
    labelKey: 'members',
    icon: <BuildingOfficeIcon className={iconClassName} />,
  },
  {
    href: '/organization/teams',
    labelKey: 'teams',
    icon: <UserGroupIcon className={iconClassName} />,
  },
  {
    href: '/organization/chatbots',
    labelKey: 'chatbots',
    icon: <ChatBubbleLeftRightIcon className={iconClassName} />,
  },
  ...(isStripeEnabled
    ? [
        {
          href: '/organization/subscription',
          labelKey: 'subscription',
          icon: <CreditCardIcon className={iconClassName} />,
        },
      ]
    : []),
  {
    href: '/organization/api-keys',
    labelKey: 'api-keys',
    icon: <KeyIcon className={iconClassName} />,
  },
  {
    href: '/organization/security',
    labelKey: 'security',
    icon: <ShieldCheckIcon className={iconClassName} />,
  },
  {
    href: '/organization/ai-usage',
    labelKey: 'ai-usage',
    icon: <CpuChipIcon className={iconClassName} />,
  },
  {
    href: '/organization/disk-usage',
    labelKey: 'disk-usage',
    icon: <CircleStackIcon className={iconClassName} />,
  },
  {
    href: '/organization/connectors',
    labelKey: 'connectors',
    icon: <PuzzlePieceIcon className={iconClassName} />,
  },
  {
    href: '/organization/audit-logs',
    labelKey: 'audit-logs',
    icon: <DocumentTextIcon className={iconClassName} />,
  },
];

export function OrganizationNav() {
  const pathname = usePathname();
  const t = useTranslations('organization-page.nav');

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
