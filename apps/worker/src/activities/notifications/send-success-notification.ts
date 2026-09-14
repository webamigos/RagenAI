import { notification } from '../../services/notifications/index.js';
import { type NotificationMessage } from '../../services/notifications/types.js';

export const sendSuccessNotification = async (message: NotificationMessage) => {
  await notification.sendSuccessNotification(message);
};
