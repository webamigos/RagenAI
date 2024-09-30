import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { SidebarItem } from '@salesyy/common-ui';
import { useSidebar } from '@/app/hooks/useSidebar';
import { SheffieldCheck, UserCircleIcon, Briefcase } from '@salesyy/common-ui';

export const MyProfileTabs = () => {
  const { closeSidebar } = useSidebar();
  const router = useRouter();
  const t = useTranslations('sidebar');

  const tabs = [
    { icon: UserCircleIcon, label: t('profile'), path: '/my-profile' },
    {
      icon: SheffieldCheck,
      label: t('security'),
      path: '/my-profile/security',
    },
    {
      icon: Briefcase,
      label: t('create-organization'),
      path: '/my-profile/create-organization',
    },
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
