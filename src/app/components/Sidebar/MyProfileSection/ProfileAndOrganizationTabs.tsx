import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';

import { useSidebar } from '@/app/hooks/useSidebar';
import {
  SheffieldCheck,
  UserCircleIcon,
  Briefcase,
  UsersIcon,
  OpenBookIcon,
  SettingsIcon,
  SidebarItem,
} from '@salesyy/common-ui';

export const ProfileAndOrganizationTabs = () => {
  const { closeSidebar } = useSidebar();
  const router = useRouter();
  const t = useTranslations('sidebar');
  const { orgRole } = useAuth();

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
      path: '/admin',
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

  const organizationTabs = getOrganizationTabs();

  const tabs = [
    { icon: UserCircleIcon, label: t('profile'), path: '/my-profile' },
    {
      icon: SheffieldCheck,
      label: t('security'),
      path: '/my-profile/security',
    },
    ...organizationTabs,
  ];

  const handleTabClick = (path: string) => {
    router.push(path);
    closeSidebar();
  };

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
