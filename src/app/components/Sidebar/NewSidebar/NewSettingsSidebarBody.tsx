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
  KeyIcon,
  CircleStackIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';

import { useTranslations } from 'next-intl';
import { useUser } from '@/app/hooks/use-auth';

const iconClassName = 'size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400';

export const NewSidebarSettingsBody = () => {
  const t = useTranslations('sidebar');
  const { user } = useUser();
  const isAppAdmin = user?.role === 'admin';

  return (
    <SidebarBody>
      <SidebarSection>
        <SidebarItem href="/new">
          <ArrowLeftIcon className={iconClassName} />
          <SidebarLabel className="font-normal">{t('back')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/organization-profile">
          <BuildingOfficeIcon className={iconClassName} />
          <SidebarLabel className="font-normal">
            {t('manage-organization')}
          </SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/prompt-management">
          <AdjustmentsHorizontalIcon className={iconClassName} />
          <SidebarLabel className="font-normal">
            {t('assistant-management')}
          </SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/subscription">
          <CreditCardIcon className={iconClassName} />
          <SidebarLabel className="font-normal">
            {t('subscription-management')}
          </SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/api-keys">
          <KeyIcon className={iconClassName} />
          <SidebarLabel className="font-normal">{t('api-keys')}</SidebarLabel>
        </SidebarItem>
        {isAppAdmin && (
          <SidebarItem href="/settings/ai-usage">
            <CpuChipIcon className={iconClassName} />
            <SidebarLabel className="font-normal">{t('ai-usage')}</SidebarLabel>
          </SidebarItem>
        )}
        {isAppAdmin && (
          <SidebarItem href="/settings/disk-usage">
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
