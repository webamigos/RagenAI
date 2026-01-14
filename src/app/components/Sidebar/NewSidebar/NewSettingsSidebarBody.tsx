import {
  SidebarBody,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@ragenai/tui/sidebar';
import {
  TicketIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  WrenchScrewdriverIcon,
  CreditCardIcon,
  KeyIcon,
} from '@heroicons/react/20/solid';

import { useTranslations } from 'next-intl';

export const NewSidebarSettingsBody = () => {
  const t = useTranslations('sidebar');

  return (
    <SidebarBody>
      <SidebarSection>
        <SidebarItem href="/">
          <ArrowLeftIcon className="w-5 h-5" />
          <SidebarLabel>{t('back')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/knowledge">
          <BookOpenIcon className="w-5 h-5" />
          <SidebarLabel>{t('manage-knowledge')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/organization-profile">
          <TicketIcon className="w-5 h-5" />
          <SidebarLabel>{t('manage-organization')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/prompt-management">
          <WrenchScrewdriverIcon className="w-5 h-5" />
          <SidebarLabel>{t('assistant-management')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/subscription">
          <CreditCardIcon className="w-5 h-5" />
          <SidebarLabel>{t('subscription-management')}</SidebarLabel>
        </SidebarItem>
        <SidebarItem href="/settings/api-keys">
          <KeyIcon className="w-5 h-5" />
          <SidebarLabel>{t('api-keys')}</SidebarLabel>
        </SidebarItem>
      </SidebarSection>
    </SidebarBody>
  );
};
