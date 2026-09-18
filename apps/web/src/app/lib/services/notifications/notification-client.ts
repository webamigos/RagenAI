'use client';

import { publicRuntimeConfig } from '@/config/public-runtime-config';
import { getPusherClient } from './pusher-client';
import { subscribeSSE } from './sse-client';
import { type NotificationEvent, type NotificationMessage } from './types';

type EventCallback = (message: NotificationMessage) => void;

// Asked at subscribe time rather than at module load: the key now comes from
// the document, which this module may be imported before.
const isPusherConfigured = () => Boolean(publicRuntimeConfig().pusherKey);

export function subscribeNotification(
  event: NotificationEvent,
  callback: EventCallback,
): () => void {
  if (isPusherConfigured()) {
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
