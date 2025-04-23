'use client';

import { usePathname } from 'next/navigation';
import { NewSidebarSettingsBody } from './NewSettingsSidebarBody';
import { NewMainSidebarBody } from './NewMainSidebarBody';

export const NewSidebarBody = () => {
  const pathname = usePathname();

  if (pathname.includes('/settings')) {
    return <NewSidebarSettingsBody />;
  }

  return <NewMainSidebarBody />;
};
