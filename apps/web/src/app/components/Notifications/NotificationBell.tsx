'use client';

import { useState, useEffect, useRef } from 'react';
import { BellIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid';
import { SidebarItem, SidebarLabel } from '@ragenai/common-ui/Sidebar';
import { NavbarItem } from '@ragenai/common-ui/Navbar';
import { useMobileSidebar } from '@ragenai/common-ui/SidebarLayout';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
  NOTIFICATION_EVENT,
  NOTIFICATIONS_READ_EVENT,
} from '@/app/lib/services/notifications/types';
import { getNotificationsAction } from '@/app/actions';

type Props = {
  variant: 'navbar' | 'sidebar';
};

/** One page of unread items is the count; past it the badge says "50+". */
const UNREAD_PAGE = 50;

export function NotificationBell({ variant }: Props) {
  const [unread, setUnread] = useState({ count: 0, more: false });
  const setUnreadRef = useRef(setUnread);
  setUnreadRef.current = setUnread;
  const pathname = usePathname();
  const isActive = pathname === '/notifications';
  const t = useTranslations('notifications');
  const { closeSidebar } = useMobileSidebar();

  useEffect(() => {
    const refresh = () => {
      getNotificationsAction({ isRead: false, limit: UNREAD_PAGE })
        .then((data) => {
          if (!data.failed) {
            setUnreadRef.current({
              count: data.items.length,
              more: data.nextCursor !== null,
            });
          }
        })
        .catch(() => {});
    };
    refresh();

    // The page marks rows read; re-read the count rather than zeroing it on
    // arrival, which left the badge at 0 after leaving with rows unread.
    window.addEventListener(NOTIFICATIONS_READ_EVENT, refresh);
    const es = new EventSource('/api/notifications/stream');
    es.addEventListener(NOTIFICATION_EVENT, () => {
      setUnreadRef.current((prev) => ({ ...prev, count: prev.count + 1 }));
    });
    return () => {
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, refresh);
      es.close();
    };
  }, []);

  const unreadCount = unread.count;
  const badgeLabel = unread.more ? `${unreadCount}+` : String(unreadCount);
  // The link's own name carries the count. The badge's `aria-label` sat on a
  // bare <span> inside a link that already had an `aria-label`, so a screen
  // reader heard "Notifications" and never the number.
  const linkLabel =
    unreadCount > 0
      ? t('label-with-unread', { count: badgeLabel })
      : t('label');
  const Icon = isActive ? BellIconSolid : BellIcon;
  // Every other icon in the sidebar is `stroke-muted-foreground`; this one
  // inherited the row's text colour and came out near-black beside them.
  const icon = <Icon className="size-5 shrink-0 stroke-muted-foreground" />;

  return (
    <div className="relative">
      {variant === 'navbar' ? (
        <NavbarItem
          href="/notifications"
          data-testid="notification-bell"
          onClick={closeSidebar}
          aria-label={linkLabel}
        >
          {icon}
        </NavbarItem>
      ) : (
        <SidebarItem
          href="/notifications"
          data-testid="notification-bell"
          onClick={closeSidebar}
          aria-label={linkLabel}
        >
          {icon}
          <SidebarLabel className="font-normal">{t('label')}</SidebarLabel>
        </SidebarItem>
      )}
      {/*
        Navy, not crimson: crimson is rationed to destructive actions, the
        marker hairline, citations, Failed and the logo (panel-ux-rules 16),
        and an unread count is none of them.
      */}
      {unreadCount > 0 && (
        <span
          className="pointer-events-none absolute left-[15px] top-[2px] flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] tabular-nums font-bold leading-none text-primary-foreground"
          data-testid="unread-badge"
          aria-hidden="true"
        >
          {badgeLabel}
        </span>
      )}
    </div>
  );
}
