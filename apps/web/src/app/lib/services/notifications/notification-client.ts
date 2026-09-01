'use client';

import { getPusherClient } from './pusher-client';
import { subscribeSSE } from './sse-client';
import { type NotificationEvent, type NotificationMessage } from './types';

type EventCallback = (message: NotificationMessage) => void;

const isPusherConfigured = Boolean(process.env.NEXT_PUBLIC_PUSHER_KEY);

export function subscribeNotification(
  event: NotificationEvent,
  callback: EventCallback,
): () => void {
  if (isPusherConfigured) {
    return subscribePusher(event, callback);
  }
  return subscribeSSE(event, callback);
}

function subscribePusher(
  event: NotificationEvent,
  callback: EventCallback,
): () => void {
  const pusher = getPusherClient();
  if (!pusher) {
    return () => {};
  }

  const channel = pusher.subscribe('ragen-ui');
  channel.bind(event, callback);

  return () => {
    channel.unbind(event, callback);
  };
}
