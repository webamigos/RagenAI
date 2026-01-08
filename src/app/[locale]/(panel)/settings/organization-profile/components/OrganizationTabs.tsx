'use client';

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { useTranslations } from 'next-intl';
import { MembersList } from './MembersList';
import { ManageInvitationsSection } from './ManageInvitationsSection';
import type { Member, Invitation } from '../types';

type Organization = {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  members: Member[];
};

type Props = {
  organization: Organization;
  invitations: Invitation[];
  currentUserRole: string;
  currentUserEmail: string;
  allowInvite: boolean;
};

export function OrganizationTabs({
  organization,
  invitations,
  currentUserRole,
  currentUserEmail,
  allowInvite,
}: Props) {
  const t = useTranslations('organization');

  const pendingInvitationsCount = invitations.filter(
    (inv) => inv.status === 'pending'
  ).length;

  return (
    <TabGroup>
      <TabList className="flex space-x-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-700 dark:text-gray-300 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 data-[selected]:bg-white data-[selected]:text-indigo-700 data-[selected]:shadow dark:data-[selected]:bg-gray-700 dark:data-[selected]:text-indigo-400">
          {t('tabs.general')}
        </Tab>
        <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-700 dark:text-gray-300 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 data-[selected]:bg-white data-[selected]:text-indigo-700 data-[selected]:shadow dark:data-[selected]:bg-gray-700 dark:data-[selected]:text-indigo-400">
          {t('tabs.members')} ({organization.members.length})
        </Tab>
        <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gray-700 dark:text-gray-300 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 data-[selected]:bg-white data-[selected]:text-indigo-700 data-[selected]:shadow dark:data-[selected]:bg-gray-700 dark:data-[selected]:text-indigo-400">
          {t('tabs.invitations')}{' '}
          {pendingInvitationsCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-indigo-600 rounded-full">
              {pendingInvitationsCount}
            </span>
          )}
        </Tab>
      </TabList>

      <TabPanels className="mt-6">
        {/* General tab - Placeholder for FAZA 2 */}
        <TabPanel className="rounded-xl bg-white p-6 shadow dark:bg-gray-900">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('profile.title')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('profile.name')}
                </label>
                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {organization.name}
                </p>
              </div>
              {organization.slug && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('profile.slug')}
                  </label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {organization.slug}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              <p>{t('profile.coming-soon')}</p>
            </div>
          </div>
        </TabPanel>

        {/* Members tab */}
        <TabPanel className="rounded-xl bg-white p-6 shadow dark:bg-gray-900">
          <MembersList
            members={organization.members}
            organizationId={organization.id}
            currentUserRole={currentUserRole}
            currentUserEmail={currentUserEmail}
            allowInvite={allowInvite}
          />
        </TabPanel>

        {/* Invitations tab */}
        <TabPanel className="rounded-xl bg-white p-6 shadow dark:bg-gray-900">
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
