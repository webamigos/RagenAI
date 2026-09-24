'use client';

import { useUser } from '@/app/hooks/use-auth';
import { signOut } from '@/app/hooks/use-better-auth';
import { SidebarLayout } from '@ragenai/common-ui/SidebarLayout';
import { CollapsedSidebarRail } from '@/app/components/Sidebar/CollapsedSidebarRail';
import { ImpersonationBanner } from '@/app/components/ImpersonationBanner';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';

const subscribeNever = () => () => {};

/**
 * False on the server and during hydration, true on every client render
 * after it. `typeof window` cannot say this: it is already true while React
 * hydrates, so when better-auth's session store resolved before the panel's
 * streamed half hydrated, the client rendered the whole shell over the
 * server's placeholder — React error #418 on the slower pages (knowledge
 * base, Brain, a thread). The server snapshot is what hydration compares.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

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

  const hydrated = useHydrated();

  // Show loading state only during initial load, not during session refetches
  if (!hydrated || !isSignedIn || (!wasAuthenticatedRef.current && !isLoaded)) {
    return <div className="min-h-screen bg-card" />;
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
