const RAGEN_API_URL = process.env.RAGEN_API_URL ?? 'http://localhost:3001';

export type ChatRequest = {
  assistant_id: string;
  content: string;
  context?: string;
  reasoning_effort?: 'low' | 'medium' | 'high';
};

export type ChatResult =
  { ok: true; text: string } | { ok: false; status: number; message: string };

/**
 * Calls apps/api's existing POST /v1/chat — the same authenticated public
 * endpoint any other API client uses. This is deliberately a thin HTTP call,
 * not a second implementation of chat: apps/api already owns assistant
 * lookup, rate limiting, and the RAG chain itself, and re-deriving any of
 * that here would be the exact duplication ADR-21 warns about.
 *
 * Always requests the non-streaming shape (`stream: false`) — an MCP tool
 * call returns one result, not a Server-Sent Events stream, so there is
 * nothing to forward a stream to.
 */
export async function chat(
  apiKey: string,
  request: ChatRequest,
): Promise<ChatResult> {
  const response = await fetch(`${RAGEN_API_URL}/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ ...request, stream: false }),
  });

  if (!response.ok) {
    // /v1/chat's error bodies are not consistent: ChatService's own errors
    // are JSON with an `error` field (404/429) or plain text (its generic
    // 500 catch-all); a failure before the controller even runs — e.g. the
    // ApiKeyGuard hitting an infra error, confirmed live when the token
    // vault was unreachable — goes through Nest's own exception filter
    // instead, which is JSON but shaped `{ message }`, not `{ error }`. Read
    // as text and try both JSON field names rather than assuming any one
    // shape.
    const rawBody = await response.text();
    let message = rawBody;
    try {
      const parsed = JSON.parse(rawBody) as {
        error?: string;
        message?: string;
      };
      if (parsed.error) {
        message = parsed.error;
      } else if (parsed.message) {
        message = parsed.message;
      }
    } catch {
      // Not JSON — keep the raw text (ChatService's own generic 500 case).
    }
    return { ok: false, status: response.status, message };
  }

  const body = (await response.json()) as { text: string };
  return { ok: true, text: body.text };
}
