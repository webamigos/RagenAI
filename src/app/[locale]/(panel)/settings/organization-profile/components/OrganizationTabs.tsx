'use client';

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { useTranslations } from 'next-intl';
import { MembersList } from './MembersList';
import { ManageInvitationsSection } from './ManageInvitationsSection';
import { OrganizationProfileForm } from './OrganizationProfileForm';
import { isOrgAdmin } from '@/lib/auth-access-control';
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
};

const tabClasses =
  'w-full rounded-lg py-2 text-sm font-medium transition-colors focus:outline-none text-zinc-500 dark:text-zinc-400 data-[selected]:bg-white data-[selected]:text-zinc-950 data-[selected]:shadow-sm dark:data-[selected]:bg-zinc-800 dark:data-[selected]:text-white';

export function OrganizationTabs({
  organization,
  invitations,
  currentUserRole,
  currentUserEmail,
  allowInvite,
}: Props) {
  const t = useTranslations('organization');

  const pendingInvitationsCount = invitations.filter(
    (inv) => inv.status === 'pending',
  ).length;

  return (
    <TabGroup>
      <TabList className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        <Tab className={tabClasses}>{t('tabs.general')}</Tab>
        <Tab className={tabClasses}>
          {t('tabs.members')} ({organization.members.length})
        </Tab>
        <Tab className={tabClasses}>
          {t('tabs.invitations')}
          {pendingInvitationsCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">
              {pendingInvitationsCount}
            </span>
          )}
        </Tab>
      </TabList>

      <TabPanels className="mt-6">
        {/* General tab - Organization profile form */}
        <TabPanel>
          <OrganizationProfileForm
            organization={organization}
            canEdit={isOrgAdmin(currentUserRole)}
          />
        </TabPanel>

        {/* Members tab */}
        <TabPanel>
          <MembersList
            members={organization.members}
            organizationId={organization.id}
            currentUserRole={currentUserRole}
            currentUserEmail={currentUserEmail}
            allowInvite={allowInvite}
          />
        </TabPanel>

        {/* Invitations tab */}
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
