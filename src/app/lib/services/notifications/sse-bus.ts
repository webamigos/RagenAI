import { EventEmitter } from 'events';

interface NotificationPayload {
  event: string;
  data: unknown;
}

type PayloadHandler = (payload: NotificationPayload) => void;

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publish(event: string, data: unknown) {
  bus.emit('notification', { event, data });
}

export function subscribe(callback: PayloadHandler): () => void {
  bus.on('notification', callback);
  return () => {
    bus.off('notification', callback);
  };
}
