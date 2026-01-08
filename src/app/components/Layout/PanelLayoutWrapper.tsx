'use client';

import { useUser } from '@/app/hooks/use-auth';
import { SidebarLayout } from '@ragenai/tui/sidebar-layout';

type Props = {
  navbar: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export const PanelLayoutWrapper = ({ navbar, sidebar, children }: Props) => {
  const { isLoaded, isSignedIn, user } = useUser();

  // During SSR, always render the children to avoid blank page
  // The middleware already handles auth protection
  const isServer = typeof window === 'undefined';
  if (isServer) {
    return (
      <SidebarLayout navbar={navbar} sidebar={sidebar}>
        {children}
      </SidebarLayout>
    );
  }

  // On client side, wait for auth to load
  if (!isLoaded || !isSignedIn) {
    return <div className="min-h-screen bg-white dark:bg-gray-900" />;
  }

  return (
    <SidebarLayout navbar={navbar} sidebar={sidebar}>
      {children}
    </SidebarLayout>
  );
};
