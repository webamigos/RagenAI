import Pusher from 'pusher';
import { NOTIFICATIONS_DEFAULT_CHANNEL } from './config';
import { NotificationEvent, NotificationMessage } from './types';

const PUSHER_APP_ID = process.env.PUSHER_APP_ID!;
const PUSHER_KEY = process.env.PUSHER_KEY!;
const PUSHER_SECRET = process.env.PUSHER_SECRET!;

const pusher = new Pusher({
  appId: PUSHER_APP_ID,
  key: PUSHER_KEY,
  secret: PUSHER_SECRET,
  cluster: 'eu',
  useTLS: true,
});

export const pushNotification = ({
  event,
  message,
}: {
  event: NotificationEvent;
  message: NotificationMessage;
}) => {
  pusher.trigger(NOTIFICATIONS_DEFAULT_CHANNEL, event, message);
};

export const sendSuccessNotification = (message: NotificationMessage) => {
  pushNotification({ event: NotificationEvent.SUCCESS_EVENT, message });
};

export const sendInfoNotification = (message: NotificationMessage) => {
  pushNotification({ event: NotificationEvent.INFO_EVENT, message });
};

export const sendErrorNotification = (message: NotificationMessage) => {
  pushNotification({ event: NotificationEvent.ERROR_EVENT, message });
};
