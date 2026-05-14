interface SSEClient {
  userId: string;
  organizationId: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
}

type ClientHandle = {
  userId: string;
  organizationId: string;
  client: SSEClient;
};

type PublishTarget =
  | { userId: string; organizationId: string }
  | { organizationId: string; userId?: never }
  | Record<string, never>;

const userClients = new Map<string, Set<SSEClient>>();
const orgClients = new Map<string, Set<SSEClient>>();
const allClients = new Set<SSEClient>();

export function registerClient(opts: {
  userId: string;
  organizationId: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
}): ClientHandle {
  const client: SSEClient = {
    userId: opts.userId,
    organizationId: opts.organizationId,
    controller: opts.controller,
    encoder: opts.encoder,
  };

  if (!userClients.has(opts.userId)) {
    userClients.set(opts.userId, new Set());
  }
  userClients.get(opts.userId)!.add(client);

  if (!orgClients.has(opts.organizationId)) {
    orgClients.set(opts.organizationId, new Set());
  }
  orgClients.get(opts.organizationId)!.add(client);

  allClients.add(client);

  return { userId: opts.userId, organizationId: opts.organizationId, client };
}

export function unregisterClient(handle: ClientHandle): void {
  const { userId, organizationId, client } = handle;

  userClients.get(userId)?.delete(client);
  if (userClients.get(userId)?.size === 0) {
    userClients.delete(userId);
  }

  orgClients.get(organizationId)?.delete(client);
  if (orgClients.get(organizationId)?.size === 0) {
    orgClients.delete(organizationId);
  }

  allClients.delete(client);
}

function sendToClient(client: SSEClient, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  try {
    client.controller.enqueue(client.encoder.encode(payload));
  } catch {
    // Client disconnected — cleanup happens via abort signal
  }
}

export function publish(
  target: PublishTarget,
  event: string,
  data: unknown,
): void {
  if ('userId' in target && target.userId) {
    const clients = userClients.get(target.userId);
    if (clients) {
      for (const client of clients) {
        if (client.organizationId === target.organizationId) {
          sendToClient(client, event, data);
        }
      }
    }
    return;
  }

  if ('organizationId' in target && target.organizationId) {
    const clients = orgClients.get(target.organizationId);
    if (clients) {
      for (const client of clients) {
        sendToClient(client, event, data);
      }
    }
    return;
  }

  // Global broadcast
  for (const client of allClients) {
    sendToClient(client, event, data);
  }
}

// Legacy API — kept for backward compat with push/route.ts
export function subscribe(
  callback: (payload: { event: string; data: unknown }) => void,
): () => void {
  const handler = (event: string, data: unknown) => callback({ event, data });
  _legacySubscribers.add(handler);
  return () => {
    _legacySubscribers.delete(handler);
  };
}

const _legacySubscribers = new Set<(event: string, data: unknown) => void>();

export function publishLegacy(event: string, data: unknown): void {
  for (const client of allClients) {
    sendToClient(client, event, data);
  }
  for (const handler of _legacySubscribers) {
    try {
      handler(event, data);
    } catch {
      // ignore
    }
  }
}
