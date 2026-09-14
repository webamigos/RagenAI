import { notification } from '../../services/notifications/index.js';
import { type NotificationMessage } from '../../services/notifications/types.js';

export const sendInfoNotification = async (message: NotificationMessage) => {
  await notification.sendInfoNotification(message);
};
