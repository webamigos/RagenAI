'use client';

import { publicRuntimeConfig } from '@/config/public-runtime-config';
import Pusher from 'pusher-js';

let pusherInstance: Pusher | null = null;

export function getPusherClient(): Pusher | null {
  const { pusherKey, pusherCluster } = publicRuntimeConfig();
  if (!pusherKey) {
    return null;
  }

  if (!pusherInstance) {
    pusherInstance = new Pusher(pusherKey, {
      cluster: pusherCluster || 'eu',
    });
  }

  return pusherInstance;
}
