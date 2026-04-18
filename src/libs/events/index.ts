import { createEventBus } from './bus';
import type { RagenEvents } from './types';

export type { RagenEvents, RagenEventId } from './types';
export type { EventBus, EventHandler, Unsubscribe } from './bus';
export { createEventBus } from './bus';

/**
 * Process-wide singleton. Emit from anywhere on the server side;
 * subscribers register themselves at app startup via
 * `registerAllSubscribers()`.
 */
export const eventBus = createEventBus<RagenEvents>();
