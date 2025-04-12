'use client';

import { useEffect } from 'react';
import Pusher from 'pusher-js';
import { NOTIFICATIONS_DEFAULT_CHANNEL } from '@/app/lib/services/notifications/config';
import { statusToast } from '@/app/lib/utils/toast';
import {
  NotificationEvent,
  NotificationMessage,
} from '@/app/lib/services/notifications/types';
import { useTranslations } from 'next-intl';

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: 'eu',
});

export function Notifications() {
  const { errorToast, infoToast, successToast } = statusToast();
  const t = useTranslations('notifications');

  // INFO: in dev mode you will see notifications twice
  // don't worry - this won't happen on production
  useEffect(() => {
    const channel = pusher.subscribe(NOTIFICATIONS_DEFAULT_CHANNEL);

    channel.bind(
      NotificationEvent.SUCCESS_EVENT,
      (notification: NotificationMessage) => {
        successToast({ message: t(notification.intlKey) });
      }
    );

    channel.bind(
      NotificationEvent.ERROR_EVENT,
      (notification: NotificationMessage) => {
        errorToast({ message: t(notification.intlKey) });
      }
    );

    channel.bind(
      NotificationEvent.INFO_EVENT,
      (notification: NotificationMessage) => {
        infoToast({ message: t(notification.intlKey) });
      }
    );

    return () => channel.disconnect();
  });

  return <></>;
}
