'use client';

import { Menu } from 'lucide-react';
import { Sidebar, SidebarProvider, useSidebar } from '@/app/components/Sidebar';

function MobileHeader() {
  const { setMobileOpen } = useSidebar();
  return (
    <header className="flex h-14 items-center border-b border-border px-4 md:hidden">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    </header>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileHeader />
          <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
