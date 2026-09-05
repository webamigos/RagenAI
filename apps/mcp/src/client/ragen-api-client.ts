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

export type AssistantSummary = { id: string; name: string };

export type ListAssistantsResult =
  | { ok: true; assistants: AssistantSummary[] }
  | { ok: false; status: number; message: string };

/**
 * Calls apps/api's existing GET /v1/assistants, scoped to the caller's own
 * organization by the API key alone — no separate access check needed here,
 * apps/api already returns "every assistant your org owns" (see
 * apps/docs/docs/api-reference/assistants.md) and nothing else.
 *
 * Returns only {id, name}: the full OpenAI Assistant object apps/api returns
 * carries several always-constant fields (tools, tool_resources, top_p,
 * response_format) that exist for OpenAI SDK compatibility, not because an
 * MCP caller choosing an assistant to talk to needs them.
 */
export async function listAssistants(
  apiKey: string,
): Promise<ListAssistantsResult> {
  const response = await fetch(`${RAGEN_API_URL}/v1/assistants`, {
    headers: { Authorization: apiKey },
  });

  if (!response.ok) {
    // AssistantsController runs entirely behind OpenAiExceptionFilter, so —
    // unlike /v1/chat — every error here is consistently
    // { error: { message, type, code, param } }, not several shapes.
    const rawBody = await response.text();
    let message = rawBody;
    try {
      const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
      if (parsed.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // Not JSON — keep the raw text.
    }
    return { ok: false, status: response.status, message };
  }

  const body = (await response.json()) as {
    data: { id: string; name: string }[];
  };
  return {
    ok: true,
    assistants: body.data.map((a) => ({ id: a.id, name: a.name })),
  };
}
