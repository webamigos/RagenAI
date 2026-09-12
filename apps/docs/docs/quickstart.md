---
sidebar_position: 4
---

# Quickstart

Your first call against your own Ragen instance, using the official
**`@webamigos/ragen-sdk-ts`** for TypeScript and JavaScript. The SDK is the
recommended way to integrate: typed responses, helpers like
`waitUntilProcessed()`, automatic retries on 429 and 5xx, and streaming that
works in Node, edge runtimes and the browser.

If you can't use the SDK (Python, Go, curl and so on), the same wire format is
available over [REST](/docs/api-reference/chat-completions).

## Prerequisites

- **A running Ragen instance.** Ragen is self-hosted – see
  [Self-hosting](/docs/self-hosting) if you don't have one yet. Everything below
  assumes it is reachable at `http://localhost:3001`; substitute your own host.
- A project with at least one document uploaded to its knowledge base
- An API key (created below)
- Node.js 18+

## Step 1: Create an API key

1. Open your Ragen instance in a browser and log in
2. Go to **Settings** > **API Keys**
3. Click **Create API Key**
4. Give it a name and select the **project** this key should access
5. Optionally enable **Debug mode** to save API conversations as threads for inspection (see [Debug mode](/docs/concepts#debug-mode))
6. Click **Create**
7. **Copy the key immediately** – it is only shown once

:::warning
Store your API key securely. It cannot be retrieved after creation; only a
masked version is kept for display.
:::

## Step 1b: Point the SDK at your instance

The SDK has no default host, because there is no hosted Ragen to default to.
Set the base URL to your own deployment:

```bash
export RAGEN_API_KEY="sk-..."
export RAGEN_BASE_URL="http://localhost:3001/v1"     # your instance
```

Every example below reads both from the environment.

## Step 2: Install the SDK

```bash
npm install @webamigos/ragen-sdk-ts
# or
pnpm add @webamigos/ragen-sdk-ts
# or
yarn add @webamigos/ragen-sdk-ts
```

## Step 3: Your first completion

```ts
import { Ragen } from "@webamigos/ragen-sdk-ts";

const ragen = new Ragen({ apiKey: process.env.RAGEN_API_KEY });

const completion = await ragen.chat.completions.create({
  assistantId: "123e4567-e89b-12d3-a456-426614174000",
  messages: [
    { role: "user", content: "What is our refund policy?" },
  ],
});

console.log(completion.choices[0].message.content);
```

The response is grounded in the project's knowledge base — retrieval,
reranking, and answer generation all happen server-side.

:::tip Pin a default assistant
If most of your calls target the same project, set `assistantId` on the
client and omit it per call:

```ts
const ragen = new Ragen({
  apiKey: process.env.RAGEN_API_KEY,
  assistantId: "123e4567-e89b-12d3-a456-426614174000",
});

await ragen.chat.completions.create({
  messages: [{ role: "user", content: "Hi" }],
});
```
:::

## Step 4: Stream tokens

```ts
const stream = ragen.chat.completions.stream({
  assistantId: "123e4567-e89b-12d3-a456-426614174000",
  messages: [{ role: "user", content: "Summarize our onboarding process" }],
  stream_options: { include_usage: true },
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
  if (chunk.usage) {
    console.log(`\n\nUsed ${chunk.usage.total_tokens} tokens`);
  }
}
```

For the common "wait for the whole thing" case, the SDK provides a
helper that returns the full text:

```ts
const text = await ragen.chat.completions.streamToString({
  assistantId: "123e4567-e89b-12d3-a456-426614174000",
  messages: [{ role: "user", content: "Summarize the handbook" }],
});
```

## Step 5: Upload files & manage assistants (optional)

```ts
// Upload a file into the knowledge base
const file = await ragen.files.upload("./handbook.pdf");

// Wait for embeddings to finish
await ragen.files.waitUntilProcessed(file.id);

// Or do both in one call
const ready = await ragen.files.uploadAndWait("./handbook.pdf");

// List, retrieve, delete
await ragen.files.list({ limit: 50 });
await ragen.files.retrieve(file.id);
await ragen.files.delete(file.id);

// Manage assistants (Ragen projects)
const assistant = await ragen.assistants.create({
  name: "Support Bot",
  instructions: "Be concise.",
});
await ragen.assistants.list();
await ragen.assistants.update(assistant.id, { name: "Support Bot v2" });
```

## Error handling

All SDK errors extend `RagenError`. Pattern-match on the subclass to
handle specific HTTP statuses:

```ts
import {
  RagenAuthError,
  RagenNotFoundError,
  RagenRateLimitError,
  RagenAPIError,
  RagenError,
} from "@webamigos/ragen-sdk-ts";

try {
  await ragen.chat.completions.create({
    assistantId: "123e4567-e89b-12d3-a456-426614174000",
    messages: [{ role: "user", content: "Hi" }],
  });
} catch (err) {
  if (err instanceof RagenRateLimitError) {
    // 429 — already auto-retried, surface to caller
  } else if (err instanceof RagenAuthError) {
    // 401 — bad API key
  } else if (err instanceof RagenNotFoundError) {
    // 404
  } else if (err instanceof RagenAPIError) {
    // 5xx — already auto-retried
  } else if (err instanceof RagenError) {
    console.error(err.status, err.code, err.message);
  } else {
    throw err;
  }
}
```

429 and 5xx responses are auto-retried with exponential backoff and
jitter, up to `maxRetries` times (default `2`).

## SDK configuration

| Option        | Type           | Default                       | Description                                                                |
| ------------- | -------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `apiKey`      | `string`       | `process.env.RAGEN_API_KEY`   | API key. Required.                                                         |
| `assistantId` | `string`       | —                             | Default `assistant_id` used when not passed per-call.                      |
| `baseURL`     | `string`       | `process.env.RAGEN_BASE_URL`  | Your instance, e.g. `http://localhost:3001/v1`. Required.                  |
| `maxRetries`  | `number`       | `2`                           | Retry attempts on 429/5xx and transient errors.                            |
| `timeout`     | `number` (ms)  | `30000`                       | Per-request timeout.                                                       |
| `fetch`       | `typeof fetch` | `globalThis.fetch`            | Custom `fetch` implementation (e.g. for testing or polyfills).             |

## Next.js App Router (edge streaming)

A common pattern — proxy the SDK stream straight to the browser:

```ts
// app/api/chat/route.ts
import { Ragen } from "@webamigos/ragen-sdk-ts";

export const runtime = "edge";

const ragen = new Ragen({
  apiKey: process.env.RAGEN_API_KEY!,
  assistantId: process.env.RAGEN_ASSISTANT_ID!,
});

export async function POST(req: Request): Promise<Response> {
  const { messages } = await req.json();
  const stream = ragen.chat.completions.stream({ messages });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const piece = chunk.choices[0]?.delta?.content;
          if (piece) {
            controller.enqueue(encoder.encode(piece));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
```

## Falling back to raw HTTP

When the SDK isn't an option (other languages, low-level integrations),
the same endpoint is available over HTTP:

```bash
curl -X POST $RAGEN_BASE_URL/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "123e4567-e89b-12d3-a456-426614174000",
    "messages": [
      {"role": "user", "content": "What is our refund policy?"}
    ]
  }'
```

For quick bot integrations where you don't need the full chat-completions
shape, a simpler single-prompt endpoint is also available:

```bash
curl -X POST $RAGEN_BASE_URL/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "What is our refund policy?"}'
```

See the [`/v1/chat` reference](/docs/api-reference/chat). New
integrations should prefer the SDK or `/v1/chat/completions`.

## What's next?

- [**Chat Completions reference**](/docs/api-reference/chat-completions) — full endpoint spec
- [**Files**](/docs/api-reference/files), [**Assistants**](/docs/api-reference/assistants), [**Threads & Messages**](/docs/api-reference/threads) — REST reference
- [**Concepts**](/docs/concepts) — projects, organizations, RAG, access control
