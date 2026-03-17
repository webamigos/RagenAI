'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { subscribeNotification } from '@/app/lib/services/notifications/notification-client';
import { statusToast } from '@/app/lib/utils/toast';
import {
  NotificationEvent,
  type NotificationMessage,
} from '@/app/lib/services/notifications/types';

export function Notifications() {
  const { errorToast, infoToast, successToast } = statusToast();
  const t = useTranslations('notifications');
  const router = useRouter();

  const handlersRef = useRef({
    t,
    router,
    successToast,
    errorToast,
    infoToast,
  });
  handlersRef.current = { t, router, successToast, errorToast, infoToast };

  // INFO: in dev mode you will see notifications twice
  // don't worry - this won't happen on production
  useEffect(() => {
    const unsubSuccess = subscribeNotification(
      NotificationEvent.SUCCESS_EVENT,
      (notification: NotificationMessage) => {
        handlersRef.current.successToast({
          message: handlersRef.current.t(notification.intlKey),
        });
        if (notification.meta?.forceRefresh) {
          handlersRef.current.router.refresh();
        }
      },
    );

    const unsubError = subscribeNotification(
      NotificationEvent.ERROR_EVENT,
      (notification: NotificationMessage) => {
        handlersRef.current.errorToast({
          message: handlersRef.current.t(notification.intlKey),
        });
      },
    );

    const unsubInfo = subscribeNotification(
      NotificationEvent.INFO_EVENT,
      (notification: NotificationMessage) => {
        handlersRef.current.infoToast({
          message: handlersRef.current.t(notification.intlKey),
        });
      },
    );

    return () => {
      unsubSuccess();
      unsubError();
      unsubInfo();
    };
  }, []);

  return <></>;
}
