import { notification } from '../../services/notifications';
import { type NotificationMessage } from '../../services/notifications/types';

export const sendSuccessNotification = async (message: NotificationMessage) => {
  await notification.sendSuccessNotification(message);
};
