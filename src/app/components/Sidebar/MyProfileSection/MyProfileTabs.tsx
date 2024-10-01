import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@clerk/nextjs';

import { OpenBookIcon, SidebarItem } from '@salesyy/common-ui';
import { useSidebar } from '@/app/hooks/useSidebar';
import {
  SheffieldCheck,
  UserCircleIcon,
  Briefcase,
  UsersIcon,
} from '@salesyy/common-ui';

export const MyProfileTabs = () => {
  const { closeSidebar } = useSidebar();
  const router = useRouter();
  const t = useTranslations('sidebar');
  const { orgId } = useAuth();

  const organizationTabs = orgId
    ? [
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
      ]
    : [
        {
          icon: Briefcase,
          label: t('create-organization'),
          path: '/my-profile/create-organization',
        },
      ];

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
