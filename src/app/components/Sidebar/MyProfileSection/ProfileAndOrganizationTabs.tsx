import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';

import { useSidebar } from '@/app/hooks/useSidebar';
import { useSyncActiveOrganization } from '@/app/hooks/useSyncActiveOrganization';
import { usePrefetchTabs } from '@/app/hooks/usePrefetchTabs';
import {
  SheffieldCheck,
  UserCircleIcon,
  Briefcase,
  UsersIcon,
  OpenBookIcon,
  SettingsIcon,
  SidebarItem,
  CreditCardIcon,
  RSSIcon,
} from '@ragenai/common-ui';

import { OrganizationRoles } from '@/app/contracts/User';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';

type Props = {
  membership?: OrganizationRoles;
};

type TabItem = {
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  label: string;
  path: `/${string}`;
  className?: string;
};

export const ProfileAndOrganizationTabs = ({ membership }: Props) => {
  const { closeSidebar } = useSidebar();
  const t = useTranslations('sidebar');
  const { orgRole } = useAuth();
  const { showOnboarding } = useOnboardingContext();

  useSyncActiveOrganization({ membership });

  const organizationTabsForNoRole: TabItem[] = [
    {
      icon: Briefcase,
      label: t('create-organization'),
      path: '/my-profile/create-organization',
      className: 'create-organization-tab',
    },
  ];

  const organizationTabsForAdminAndOwner: TabItem[] = [
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
      path: '/manage-knowledge/documents-list',
    },
    {
      icon: SettingsIcon,
      label: t('assistant-management'),
      path: '/my-profile/prompt-management',
    },
    {
      icon: CreditCardIcon,
      label: t('subscription-management'),
      path: '/my-profile/subscription',
    },
    {
      icon: RSSIcon,
      label: t('generate-access-key'),
      path: '/generate-access-key',
    },
  ];

  const organizationTabsForMember: TabItem[] = [
    {
      icon: Briefcase,
      label: t('organization-list'),
      path: '/my-profile/organization-profile/',
    },
  ];

  const getOrganizationTabs = () => {
    if (orgRole === 'org:owner' || orgRole === 'org:admin') {
      return organizationTabsForAdminAndOwner;
    }

    if (orgRole === 'org:member') {
      return organizationTabsForMember;
    }

    const tabsForNoRole = [...organizationTabsForNoRole];
    if (showOnboarding) {
      tabsForNoRole.push(
        {
          icon: SettingsIcon,
          label: t('assistant-management'),
          path: '/my-profile/prompt-management',
          className: 'assistant-management',
        },
        {
          icon: OpenBookIcon,
          label: t('manage-knowledge'),
          path: '/manage-knowledge/create-document',
          className: 'manage-knowledge',
        }
      );
    }

    return tabsForNoRole;
  };

  const tabs: TabItem[] = useMemo(() => {
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

  usePrefetchTabs(tabs);

  return (
    <div>
      {tabs.map(({ icon: Icon, label, path, className }) => (
        <SidebarItem
          hasIcon={true}
          key={path}
          href={path}
          onClick={closeSidebar}
          className={className}
        >
          <Icon />
          {label}
        </SidebarItem>
      ))}
    </div>
  );
};
