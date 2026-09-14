import { notification } from '../../services/notifications/index.js';
import { type NotificationMessage } from '../../services/notifications/types.js';

export const sendErrorNotification = async (message: NotificationMessage) => {
  await notification.sendErrorNotification(message);
};
