import { logger } from '../logger';
import { NOTIFICATIONS_DEFAULT_CHANNEL } from './config';
import { NotificationEvent, type NotificationMessage } from './types';

const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
const PUSHER_KEY = process.env.PUSHER_KEY;
const PUSHER_SECRET = process.env.PUSHER_SECRET;

const isPusherConfigured = Boolean(
  PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET,
);

let pusherInstance: import('pusher') | null = null;

async function getPusherInstance() {
  if (!pusherInstance) {
    const Pusher =
      (await import('pusher')) as unknown as typeof import('pusher');
    pusherInstance = new Pusher({
      appId: PUSHER_APP_ID!,
      key: PUSHER_KEY!,
      secret: PUSHER_SECRET!,
      cluster: 'eu',
      useTLS: true,
    });
  }
  return pusherInstance;
}

export const pushNotification = async ({
  event,
  message,
}: {
  event: NotificationEvent;
  message: NotificationMessage;
}) => {
  if (isPusherConfigured) {
    const pusher = await getPusherInstance();
    await pusher.trigger(NOTIFICATIONS_DEFAULT_CHANNEL, event, message);
  } else {
    await pushViaHTTP(event, message);
  }
};

async function pushViaHTTP(
  event: NotificationEvent,
  message: NotificationMessage,
) {
  const appUrl = process.env.RAGEN_APP_URL;
  const secretKey = process.env.WORKER_SECRET_KEY;

  if (!appUrl || !secretKey) {
    logger.warn(
      {
        appUrl: Boolean(appUrl),
        secretKeySet: Boolean(secretKey),
        component: 'notifications',
      },
      'SSE notification skipped: RAGEN_APP_URL and WORKER_SECRET_KEY must be set when Pusher is not configured',
    );
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${appUrl}/api/notifications/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': secretKey,
      },
      body: JSON.stringify({ event, message }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          component: 'notifications',
        },
        `Failed to push SSE notification: ${response.status} ${response.statusText}`,
      );
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      logger.error(
        { component: 'notifications', appUrl },
        'SSE notification timed out',
      );
    } else {
      logger.error(
        { err, component: 'notifications', appUrl },
        'SSE notification failed',
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

const sendSuccessNotification = (message: NotificationMessage) => {
  return pushNotification({ event: NotificationEvent.SUCCESS_EVENT, message });
};

const sendInfoNotification = (message: NotificationMessage) => {
  return pushNotification({ event: NotificationEvent.INFO_EVENT, message });
};

const sendErrorNotification = (message: NotificationMessage) => {
  return pushNotification({ event: NotificationEvent.ERROR_EVENT, message });
};

export const notification = {
  sendSuccessNotification,
  sendInfoNotification,
  sendErrorNotification,
};
