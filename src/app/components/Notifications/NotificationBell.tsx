'use client';

import { useState, useEffect, useRef } from 'react';
import { BellIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid';
import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import { usePathname } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { NOTIFICATION_EVENT } from '@/app/lib/services/notifications/types';
import { getNotificationsAction } from '@/app/actions';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const setUnreadRef = useRef(setUnreadCount);
  setUnreadRef.current = setUnreadCount;
  const pathname = usePathname();
  const isActive = pathname === '/notifications';
  const t = useTranslations('notifications');

  useEffect(() => {
    getNotificationsAction({ isRead: false, limit: 50 })
      .then((data) => setUnreadCount(data.items.length))
      .catch(() => {});

    const es = new EventSource('/api/notifications/stream');
    es.addEventListener(NOTIFICATION_EVENT, () => {
      setUnreadRef.current((prev) => prev + 1);
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    if (isActive) {
      setUnreadCount(0);
    }
  }, [isActive]);

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const Icon = isActive ? BellIconSolid : BellIcon;

  return (
    <div className="relative">
      <SidebarItem href="/notifications" data-testid="notification-bell">
        <Icon className="size-5 shrink-0 stroke-zinc-500 dark:stroke-zinc-400" />
        <SidebarLabel className="font-normal">{t('label')}</SidebarLabel>
      </SidebarItem>
      {unreadCount > 0 && (
        <span
          className="pointer-events-none absolute left-[16px] top-[3px] flex min-w-[14px] h-[14px] items-center justify-center rounded-full bg-[#cb1d3d] px-[3px] text-[8px] font-bold leading-none text-white"
          data-testid="unread-badge"
          aria-label={`${unreadCount} ${t('unread-aria')}`}
        >
          {badgeLabel}
        </span>
      )}
    </div>
  );
}
