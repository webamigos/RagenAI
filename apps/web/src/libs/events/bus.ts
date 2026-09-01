export type Unsubscribe = () => void;

export type EventHandler<TPayload> = (
  payload: TPayload,
) => void | Promise<void>;

export type EventBus<TEvents extends Record<string, unknown>> = {
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): Promise<void>;
  on<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>,
  ): Unsubscribe;
  /** Test helper — wipes all subscribers. Do not use in app code. */
  reset(): void;
  listenerCount<K extends keyof TEvents>(event: K): number;
};

type FailureReporter = (info: { event: string; error: unknown }) => void;

const defaultReporter: FailureReporter = ({ event, error }) => {
  // The event bus runs in server-side contexts where we can't always
  // pull in pino (auth hooks avoid heavy imports). `console.error` is
  // intentional — OTel log forwarding picks it up, and it never risks
  // pulling logger deps into Edge bundles.
  // eslint-disable-next-line no-console
  console.error(`[events] subscriber failed for "${event}"`, error);
};

export function createEventBus<TEvents extends Record<string, unknown>>(
  options: { onFailure?: FailureReporter } = {},
): EventBus<TEvents> {
  const handlers = new Map<
    keyof TEvents,
    Set<EventHandler<TEvents[keyof TEvents]>>
  >();
  const onFailure = options.onFailure ?? defaultReporter;

  return {
    async emit(event, payload) {
      const set = handlers.get(event);
      if (!set || set.size === 0) {
        return;
      }
      // Snapshot first — a handler may unsubscribe itself during emit
      // and Set iteration during mutation would be surprising.
      const snapshot = Array.from(set);
      const results = await Promise.allSettled(
        snapshot.map(async (handler) => handler(payload)),
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          // A broken reporter must never block other notifications or
          // make emit() reject — that would give one buggy subscriber
          // (via its failure report) the power to take out siblings.
          try {
            onFailure({ event: String(event), error: result.reason });
          } catch (reporterError) {
            // eslint-disable-next-line no-console
            console.error(
              `[events] failure reporter threw for "${String(event)}"`,
              reporterError,
            );
          }
        }
      }
    },
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      const boundSet = set;
      const cast = handler as EventHandler<TEvents[keyof TEvents]>;
      boundSet.add(cast);
      return () => {
        boundSet.delete(cast);
        if (boundSet.size === 0) {
          handlers.delete(event);
        }
      };
    },
    reset() {
      handlers.clear();
    },
    listenerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },
  };
}
