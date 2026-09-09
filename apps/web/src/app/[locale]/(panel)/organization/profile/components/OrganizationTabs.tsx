'use client';

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { useTranslations } from 'next-intl';
import { MembersList } from './MembersList';
import { ManageInvitationsSection } from './ManageInvitationsSection';
import type { Member, Invitation } from '../types';

type Organization = {
  id: string;
  name: string;
  members: Member[];
};

type Props = {
  organization: Organization;
  invitations: Invitation[];
  currentUserRole: string;
  currentUserEmail: string;
  allowInvite: boolean;
  /** The viewer is the shared demo account — see `MembersList`. */
  demoAccount?: boolean;
};

const tabClasses =
  'w-full rounded-lg py-2 text-sm font-medium transition-colors focus:outline-none text-muted-foreground data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-sm dark:data-[selected]:bg-muted';

export function OrganizationTabs({
  organization,
  invitations,
  currentUserRole,
  currentUserEmail,
  allowInvite,
  demoAccount = false,
}: Props) {
  const t = useTranslations('organization');

  const pendingInvitationsCount = invitations.filter(
    (inv) => inv.status === 'pending',
  ).length;

  return (
    <TabGroup>
      <TabList className="flex gap-1 rounded-lg bg-muted p-1 dark:bg-card">
        <Tab className={tabClasses}>
          {t('tabs.members')} ({organization.members.length})
        </Tab>
        <Tab className={tabClasses}>
          {t('tabs.invitations')}
          {pendingInvitationsCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-xs font-medium text-background">
              {pendingInvitationsCount}
            </span>
          )}
        </Tab>
      </TabList>

      <TabPanels className="mt-6">
        <TabPanel>
          <MembersList
            members={organization.members}
            organizationId={organization.id}
            currentUserRole={currentUserRole}
            currentUserEmail={currentUserEmail}
            allowInvite={allowInvite}
            demoAccount={demoAccount}
          />
        </TabPanel>

        <TabPanel>
          <ManageInvitationsSection
            invitations={invitations}
            organizationId={organization.id}
            currentUserRole={currentUserRole}
          />
        </TabPanel>
      </TabPanels>
    </TabGroup>
  );
}
