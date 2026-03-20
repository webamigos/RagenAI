'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Building2,
  Brain,
  HardDrive,
  ScrollText,
  LogOut,
  LayoutDashboard,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  CreditCard,
} from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/organizations', label: 'Organizations', icon: Building2 },
  { href: '/invitations', label: 'Invitations', icon: Mail },
  { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/ai-usage', label: 'AI Usage', icon: Brain },
  { href: '/disk-usage', label: 'Disk Usage', icon: HardDrive },
  { href: '/activity-log', label: 'Activity Log', icon: ScrollText },
];

const SidebarContext = createContext<{
  collapsed: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  setMobileOpen: (open: boolean) => void;
}>({
  collapsed: false,
  mobileOpen: false,
  toggle: () => {},
  setMobileOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return localStorage.getItem('admin-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('admin-sidebar-collapsed', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = () => {
      if (mql.matches) {
        setMobileOpen(false);
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ collapsed, mobileOpen, toggle, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, toggle, setMobileOpen } = useSidebar();

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar (full) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent
          pathname={pathname}
          collapsed={false}
          onNavigate={() => setMobileOpen(false)}
          toggle={toggle}
        />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
          collapsed ? 'w-14' : 'w-64',
        )}
      >
        <SidebarContent
          pathname={pathname}
          collapsed={collapsed}
          toggle={toggle}
        />
      </aside>
    </>
  );
}

function SidebarContent({
  pathname,
  collapsed,
  onNavigate,
  toggle,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  toggle: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          'flex h-14 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {!collapsed && (
          <h1 className="text-lg font-bold text-sidebar-foreground">
            Ragen Admin
          </h1>
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-md transition-colors',
                collapsed
                  ? 'justify-center px-2 py-2'
                  : 'gap-3 px-3 py-2 text-sm font-medium',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          'border-t border-sidebar-border p-2',
          collapsed
            ? 'flex flex-col items-center gap-2'
            : 'flex items-center justify-between',
        )}
      >
        {!collapsed && <ThemeToggle />}
        <button
          type="button"
          onClick={() =>
            signOut({
              fetchOptions: {
                onSuccess: () => window.location.assign('/login'),
              },
            })
          }
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            collapsed
              ? 'justify-center p-2'
              : 'gap-3 px-3 py-2 text-sm font-medium',
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}
