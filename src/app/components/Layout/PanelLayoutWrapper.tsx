'use client';

import { useUser } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';
import { SidebarLayout } from '@ragenai/tui/sidebar-layout';
import { CollapsedSidebarRail } from '@/app/components/Sidebar/CollapsedSidebarRail';
import { useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';

type Props = {
  navbar: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export const PanelLayoutWrapper = ({ navbar, sidebar, children }: Props) => {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || 'pl';

  // Clear invalid session and redirect to login
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Clear the invalid session cookie before redirecting
      signOut().finally(() => {
        router.replace(`/${locale}/sign-in`);
      });
    }
  }, [isLoaded, isSignedIn, router, locale]);

  // Show loading state during SSR and initial client load
  // This prevents flash of dashboard content before auth check completes
  const isServer = typeof window === 'undefined';
  if (isServer || !isLoaded || !isSignedIn) {
    return <div className="min-h-screen bg-white dark:bg-gray-900" />;
  }

  return (
    <SidebarLayout
      navbar={navbar}
      sidebar={sidebar}
      collapsedSidebar={<CollapsedSidebarRail />}
    >
      {children}
    </SidebarLayout>
  );
};
