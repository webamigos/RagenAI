import { notification } from '../../services/notifications';
import { NotificationMessage } from '../../services/notifications/types';

export const sendInfoNotification = async (message: NotificationMessage) => {
  await notification.sendInfoNotification(message);
};
