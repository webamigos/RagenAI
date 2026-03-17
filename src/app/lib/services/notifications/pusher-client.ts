'use client';

import Pusher from 'pusher-js';

let pusherInstance: Pusher | null = null;

export function getPusherClient(): Pusher | null {
  if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
    return null;
  }

  if (!pusherInstance) {
    pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: 'eu',
    });
  }

  return pusherInstance;
}
