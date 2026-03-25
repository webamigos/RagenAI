'use client';

import { NotificationEvent, type NotificationMessage } from './types';

type EventCallback = (message: NotificationMessage) => void;

let eventSource: EventSource | null = null;
let authFailed = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Map<string, Set<EventCallback>>();

const RECONNECT_DELAY_MS = 5_000;

function ensureConnection() {
  if (eventSource || authFailed || reconnectTimer) {
    return;
  }

  eventSource = new EventSource('/api/notifications/stream');

  for (const eventType of Object.values(NotificationEvent)) {
    eventSource.addEventListener(eventType, (e: MessageEvent) => {
      const callbacks = listeners.get(eventType);
      if (!callbacks) {
        return;
      }

      let data: NotificationMessage;
      try {
        data = JSON.parse(e.data) as NotificationMessage;
      } catch {
        return;
      }

      for (const cb of callbacks) {
        try {
          cb(data);
        } catch {
          // Prevent one failing listener from blocking others
        }
      }
    });
  }

  eventSource.onerror = () => {
    if (eventSource?.readyState === EventSource.CLOSED) {
      eventSource = null;

      let total = 0;
      for (const set of listeners.values()) {
        total += set.size;
      }

      if (total > 0) {
        // Debounce reconnection to avoid hammering the server (e.g. on 401)
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          ensureConnection();
        }, RECONNECT_DELAY_MS);
      }
    }
  };

  // Detect auth failure: EventSource doesn't expose HTTP status codes, so
  // we probe the endpoint once. If it returns 401/403, stop reconnecting.
  fetch('/api/notifications/stream', { method: 'HEAD' })
    .then((res) => {
      if (res.status === 401 || res.status === 403) {
        authFailed = true;
        eventSource?.close();
        eventSource = null;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      }
    })
    .catch(() => {
      // Network error — let EventSource handle reconnect
    });
}

function closeIfNoListeners() {
  let total = 0;
  for (const set of listeners.values()) {
    total += set.size;
  }
  if (total === 0 && eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function subscribeSSE(
  event: NotificationEvent,
  callback: EventCallback,
): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(callback);

  // Reset auth failure flag — the user may have logged in since the last attempt
  authFailed = false;
  ensureConnection();

  return () => {
    listeners.get(event)?.delete(callback);
    closeIfNoListeners();
  };
}
