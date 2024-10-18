import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';

import { useSidebar } from '@/app/hooks/useSidebar';
import { useSyncActiveOrganization } from '@/app/hooks/useSyncActiveOrganization';
import {
  SheffieldCheck,
  UserCircleIcon,
  Briefcase,
  UsersIcon,
  OpenBookIcon,
  SettingsIcon,
  SidebarItem,
} from '@salesyy/common-ui';

import { OrganizationRoles } from '@/app/contracts/User';
import { useEffect, useMemo } from 'react';

type Props = {
  membership?: OrganizationRoles;
};

export const ProfileAndOrganizationTabs = ({ membership }: Props) => {
  const { closeSidebar } = useSidebar();
  const router = useRouter();
  const t = useTranslations('sidebar');
  const { orgRole } = useAuth();

  useSyncActiveOrganization({ membership });

  const organizationTabsForNoRole = [
    {
      icon: Briefcase,
      label: t('create-organization'),
      path: '/my-profile/create-organization',
    },
  ];

  const organizationTabsForAdminAndOwner = [
    {
      icon: Briefcase,
      label: t('manage-organization'),
      path: '/my-profile/organization-profile',
    },
    {
      icon: UsersIcon,
      label: t('manage-members'),
      path: '/my-profile/organization-profile/organization-members',
    },
    {
      icon: OpenBookIcon,
      label: t('manage-knowledge'),
      path: '/manage-knowledge',
    },
    {
      icon: SettingsIcon,
      label: t('assistant-management'),
      path: '/my-profile/prompt-management',
    },
  ];

  const organizationTabsForMember = [
    {
      icon: Briefcase,
      label: t('organization-list'),
      path: '/my-profile/organization-profile/',
    },
    {
      icon: Briefcase,
      label: t('create-organization'),
      path: '/my-profile/create-organization',
    },
  ];

  const getOrganizationTabs = () => {
    if (orgRole === 'org:owner' || orgRole === 'org:admin') {
      return organizationTabsForAdminAndOwner;
    }

    if (orgRole === 'org:member') {
      return organizationTabsForMember;
    }

    return organizationTabsForNoRole;
  };

  const tabs = useMemo(() => {
    const organizationTabs = getOrganizationTabs();

    return [
      { icon: UserCircleIcon, label: t('profile'), path: '/my-profile' },
      {
        icon: SheffieldCheck,
        label: t('security'),
        path: '/my-profile/security',
      },
      ...organizationTabs,
    ];
  }, [t, orgRole]);

  const handleTabClick = (path: string) => {
    router.push(path);
    closeSidebar();
  };

  useEffect(() => {
    tabs.forEach((tab) => {
      router.prefetch(tab.path);
    });
  }, [tabs, router]);

  return (
    <div>
      {tabs.map(({ icon: Icon, label, path }) => (
        <SidebarItem key={path} onClick={() => handleTabClick(path)}>
          <Icon />
          {label}
        </SidebarItem>
      ))}
    </div>
  );
};
