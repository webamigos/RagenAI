'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Building2,
  Brain,
  HardDrive,
  ScrollText,
  ShieldAlert,
  LogOut,
  LayoutDashboard,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Gauge,
  Bot,
  Sparkles,
  Layers,
  Plug,
  ShieldCheck,
  ToggleRight,
  KeyRound,
  PlugZap,
  ArrowRightLeft,
  ListChecks,
  ExternalLink,
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
  { href: '/features', label: 'Features', icon: ToggleRight },
  { href: '/limits', label: 'Limits', icon: Gauge },
  { href: '/models', label: 'Models', icon: Bot },
  { href: '/connectors', label: 'Connectors', icon: Plug },
  { href: '/connector-health', label: 'Connector Health', icon: PlugZap },
  { href: '/rag-settings', label: 'RAG Settings', icon: Layers },
  {
    href: '/assistant-templates',
    label: 'Global Assistants',
    icon: Sparkles,
  },
  { href: '/template-access', label: 'Assistants Access', icon: ShieldCheck },
  { href: '/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/defaults', label: 'Apply Defaults', icon: ArrowRightLeft },
  { href: '/ai-usage', label: 'AI Usage', icon: Brain },
  { href: '/disk-usage', label: 'Disk Usage', icon: HardDrive },
  { href: '/activity-log', label: 'Activity Log', icon: ScrollText },
  { href: '/incidents', label: 'Incidents', icon: ShieldAlert },
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Sync collapsed state from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem('admin-sidebar-collapsed');
      if (saved === 'true') {
        setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

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

/**
 * Where the queue dashboard lives, when there is one.
 *
 * It is the worker's own surface — bull-board on `WORKER_ADMIN_PORT`, behind
 * Basic Auth — not a page of this app, so this is an external link and the
 * panel cannot know the address: the worker may be a different container or a
 * different host. An unset `WORKER_ADMIN_URL` hides the item rather than
 * offering a link to a port that answers nothing, which is the failure a
 * hard-coded `localhost:8090` would ship to every install.
 *
 * Passed down from the server layout instead of read here. A `NEXT_PUBLIC_`
 * variable is inlined at build time, so one set at runtime renders on the
 * server and vanishes on hydration — see
 * `docs/lessons/a-next-public-var-set-at-runtime-flashes-then-vanishes.md`.
 */
export function Sidebar({ queueDashboardUrl }: { queueDashboardUrl?: string }) {
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
          queueDashboardUrl={queueDashboardUrl}
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
          queueDashboardUrl={queueDashboardUrl}
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
  queueDashboardUrl,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  toggle: () => void;
  queueDashboardUrl?: string;
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

        {queueDashboardUrl && (
          <a
            href={queueDashboardUrl}
            target="_blank"
            rel="noreferrer"
            title={collapsed ? 'Queue Dashboard' : undefined}
            className={cn(
              'flex items-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed
                ? 'justify-center px-2 py-2'
                : 'gap-3 px-3 py-2 text-sm font-medium',
            )}
          >
            <ListChecks className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span>Queue Dashboard</span>
                {/* Says "this leaves the panel" before the click, which is the
                    honest thing for a surface with its own Basic Auth prompt. */}
                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
              </>
            )}
          </a>
        )}
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
