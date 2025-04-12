export enum NotificationEvent {
  SUCCESS_EVENT = 'success-event',
  INFO_EVENT = 'info-event',
  ERROR_EVENT = 'error-event',
}

export type NotificationMessage = {
  content: string;
  intlKey: string;
  meta?: object;
};
