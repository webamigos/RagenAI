'use client';

import { useUser } from '@/app/hooks/use-auth';
import { SidebarLayout } from '@ragenai/tui/sidebar-layout';

type Props = {
  navbar: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export const PanelLayoutWrapper = ({ navbar, sidebar, children }: Props) => {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded || !isSignedIn) {
    return <div className="min-h-screen bg-white dark:bg-gray-900" />;
  }

  return (
    <SidebarLayout navbar={navbar} sidebar={sidebar}>
      {children}
    </SidebarLayout>
  );
};
