import { notification } from '../../services/notifications';
import { type NotificationMessage } from '../../services/notifications/types';

export const sendErrorNotification = async (message: NotificationMessage) => {
  await notification.sendErrorNotification(message);
};
