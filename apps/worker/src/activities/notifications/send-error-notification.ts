import { notification } from '../../services/notifications';
import { NotificationMessage } from '../../services/notifications/types';

export const sendErrorNotification = async (message: NotificationMessage) => {
  await notification.sendErrorNotification(message);
};
