import { NOTIFICATIONS_DEFAULT_CHANNEL } from './config';
import { NotificationEvent, type NotificationMessage } from './types';

const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
const PUSHER_KEY = process.env.PUSHER_KEY;
const PUSHER_SECRET = process.env.PUSHER_SECRET;
const PUSHER_CLUSTER =
  process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu';

const isPusherConfigured = Boolean(
  PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET,
);

async function getPusherInstance() {
  const Pusher = (await import('pusher')).default;
  return new Pusher({
    appId: PUSHER_APP_ID!,
    key: PUSHER_KEY!,
    secret: PUSHER_SECRET!,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
}

let pusherInstance: Awaited<ReturnType<typeof getPusherInstance>> | null = null;

async function pushViaPusher(
  event: NotificationEvent,
  message: NotificationMessage,
) {
  if (!pusherInstance) {
    pusherInstance = await getPusherInstance();
  }
  await pusherInstance.trigger(NOTIFICATIONS_DEFAULT_CHANNEL, event, message);
}

async function pushViaSSE(
  event: NotificationEvent,
  message: NotificationMessage,
) {
  const { publishLegacy } = await import('./sse-bus');
  publishLegacy(event, message);
}

export const pushNotification = async ({
  event,
  message,
}: {
  event: NotificationEvent;
  message: NotificationMessage;
}) => {
  if (isPusherConfigured) {
    await pushViaPusher(event, message);
  } else {
    await pushViaSSE(event, message);
  }
};

export const sendSuccessNotification = (message: NotificationMessage) => {
  return pushNotification({ event: NotificationEvent.SUCCESS_EVENT, message });
};

export const sendInfoNotification = (message: NotificationMessage) => {
  return pushNotification({ event: NotificationEvent.INFO_EVENT, message });
};

export const sendErrorNotification = (message: NotificationMessage) => {
  return pushNotification({ event: NotificationEvent.ERROR_EVENT, message });
};
