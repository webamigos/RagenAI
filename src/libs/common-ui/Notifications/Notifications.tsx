'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { NOTIFICATIONS_DEFAULT_CHANNEL } from '@/app/lib/services/notifications/config';
import { getPusherClient } from '@/app/lib/services/notifications/pusher-client';
import { statusToast } from '@/app/lib/utils/toast';
import {
  NotificationEvent,
  type NotificationMessage,
} from '@/app/lib/services/notifications/types';

export function Notifications() {
  const { errorToast, infoToast, successToast } = statusToast();
  const t = useTranslations('notifications');
  const router = useRouter();

  // INFO: in dev mode you will see notifications twice
  // don't worry - this won't happen on production
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(NOTIFICATIONS_DEFAULT_CHANNEL);

    channel.bind(
      NotificationEvent.SUCCESS_EVENT,
      (notification: NotificationMessage) => {
        successToast({ message: t(notification.intlKey) });
        if (notification.meta?.forceRefresh) {
          router.refresh();
        }
      },
    );

    channel.bind(
      NotificationEvent.ERROR_EVENT,
      (notification: NotificationMessage) => {
        errorToast({ message: t(notification.intlKey) });
      },
    );

    channel.bind(
      NotificationEvent.INFO_EVENT,
      (notification: NotificationMessage) => {
        infoToast({ message: t(notification.intlKey) });
      },
    );

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(NOTIFICATIONS_DEFAULT_CHANNEL);
    };
  });

  return <></>;
}
