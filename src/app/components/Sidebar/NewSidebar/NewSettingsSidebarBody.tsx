'use client';

import {
  SidebarBody,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@ragenai/tui/sidebar';
import {
  ArrowLeftIcon,
  BuildingOfficeIcon,
  AdjustmentsHorizontalIcon,
  CreditCardIcon,
  CircleStackIcon,
  CpuChipIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

import { useTranslations } from 'next-intl';
import { useUser } from '@/app/hooks/use-auth';
import { useMobileSidebar } from '@ragenai/tui/sidebar-layout';

const iconClassName = 'size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400';

export const NewSidebarSettingsBody = () => {
  const t = useTranslations('sidebar');
  const { isAppAdmin } = useUser();
  const { closeSidebar } = useMobileSidebar();

  return (
    <SidebarBody>
      <SidebarSection>
        <SidebarItem href="/new" onClick={closeSidebar}>
          <ArrowLeftIcon className={iconClassName} />
          <SidebarLabel className="font-normal">{t('back')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/organization/profile" onClick={closeSidebar}>
          <BuildingOfficeIcon className={iconClassName} />
          <SidebarLabel className="font-normal">
            {t('manage-organization')}
          </SidebarLabel>
        </SidebarItem>
        <SidebarItem
          href="/organization/assistant-settings"
          onClick={closeSidebar}
        >
          <AdjustmentsHorizontalIcon className={iconClassName} />
          <SidebarLabel className="font-normal">
            {t('assistant-management')}
          </SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/organization/subscription" onClick={closeSidebar}>
          <CreditCardIcon className={iconClassName} />
          <SidebarLabel className="font-normal">
            {t('subscription-management')}
          </SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/organization/teams" onClick={closeSidebar}>
          <UserGroupIcon className={iconClassName} />
          <SidebarLabel className="font-normal">{t('teams')}</SidebarLabel>
        </SidebarItem>
        {isAppAdmin && (
          <SidebarItem href="/settings/users" onClick={closeSidebar}>
            <UsersIcon className={iconClassName} />
            <SidebarLabel className="font-normal">{t('users')}</SidebarLabel>
          </SidebarItem>
        )}
        {isAppAdmin && (
          <SidebarItem href="/organization/ai-usage" onClick={closeSidebar}>
            <CpuChipIcon className={iconClassName} />
            <SidebarLabel className="font-normal">{t('ai-usage')}</SidebarLabel>
          </SidebarItem>
        )}
        {isAppAdmin && (
          <SidebarItem href="/organization/disk-usage" onClick={closeSidebar}>
            <CircleStackIcon className={iconClassName} />
            <SidebarLabel className="font-normal">
              {t('disk-usage')}
            </SidebarLabel>
          </SidebarItem>
        )}
      </SidebarSection>
    </SidebarBody>
  );
};
