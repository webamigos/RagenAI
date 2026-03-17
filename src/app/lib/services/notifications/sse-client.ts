'use client';

import { NotificationEvent, type NotificationMessage } from './types';

type EventCallback = (message: NotificationMessage) => void;

let eventSource: EventSource | null = null;
const listeners = new Map<string, Set<EventCallback>>();

function ensureConnection() {
  if (eventSource) {
    return;
  }

  eventSource = new EventSource('/api/notifications/stream');

  for (const eventType of Object.values(NotificationEvent)) {
    eventSource.addEventListener(eventType, (e: MessageEvent) => {
      const callbacks = listeners.get(eventType);
      if (callbacks) {
        try {
          const data = JSON.parse(e.data) as NotificationMessage;
          for (const cb of callbacks) {
            cb(data);
          }
        } catch {
          // Ignore malformed messages
        }
      }
    });
  }

  eventSource.onerror = () => {
    // EventSource auto-reconnects on transient errors.
    // If permanently closed, re-establish if there are active listeners.
    if (eventSource?.readyState === EventSource.CLOSED) {
      eventSource = null;
      let total = 0;
      for (const set of listeners.values()) {
        total += set.size;
      }
      if (total > 0) {
        ensureConnection();
      }
    }
  };
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
  ensureConnection();

  return () => {
    listeners.get(event)?.delete(callback);
    closeIfNoListeners();
  };
}
