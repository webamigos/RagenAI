'use client';

import { useUser } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';
import { SidebarLayout } from '@ragenai/common-ui/SidebarLayout';
import { CollapsedSidebarRail } from '@/app/components/Sidebar/CollapsedSidebarRail';
import { ImpersonationBanner } from '@/app/components/ImpersonationBanner';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

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
  const wasAuthenticatedRef = useRef(false);

  if (isLoaded && isSignedIn) {
    wasAuthenticatedRef.current = true;
  }

  // Clear invalid session and redirect to login
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Clear the invalid session cookie before redirecting
      signOut().finally(() => {
        router.replace(`/${locale}/sign-in`);
      });
    }
  }, [isLoaded, isSignedIn, router, locale]);

  // Show loading state only during initial load, not during session refetches
  const isServer = typeof window === 'undefined';
  if (isServer || !isSignedIn || (!wasAuthenticatedRef.current && !isLoaded)) {
    return <div className="min-h-screen bg-white dark:bg-card" />;
  }

  return (
    <>
      <ImpersonationBanner />
      <SidebarLayout
        navbar={navbar}
        sidebar={sidebar}
        collapsedSidebar={<CollapsedSidebarRail />}
      >
        {children}
      </SidebarLayout>
    </>
  );
};
