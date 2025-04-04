'use client';

import { useEffect } from 'react';
import Pusher from 'pusher-js';
import { NOTIFICATIONS_DEFAULT_CHANNEL } from '@/app/lib/services/notifications/config';
import { NotificationEvent } from '@/app/lib/services/notifications/types';
import { statusToast } from '@/app/lib/utils/toast';

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: 'eu',
});

export function Notifications() {
  const { errorToast, infoToast, successToast } = statusToast();

  // INFO: in dev mode you will see notifications twice
  // don't worry - this won't happen on production
  useEffect(() => {
    const channel = pusher.subscribe(NOTIFICATIONS_DEFAULT_CHANNEL);

    channel.bind(NotificationEvent.SUCCESS_EVENT, (data: any) => {
      successToast({ message: JSON.stringify(data) });
    });

    channel.bind(NotificationEvent.ERROR_EVENT, (data: any) => {
      errorToast({ message: JSON.stringify(data) });
    });

    channel.bind(NotificationEvent.INFO_EVENT, (data: any) => {
      infoToast({ message: JSON.stringify(data) });
    });

    return () => channel.disconnect();
  });

  return <></>;
}
