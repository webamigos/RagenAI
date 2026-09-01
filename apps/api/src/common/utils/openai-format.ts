import { randomUUID } from 'node:crypto';

/**
 * Usage block returned by OpenAI on non-streaming chat completions and
 * on the final streaming chunk when `stream_options.include_usage` is
 * set. We always include it because LiteLLM / the Vercel AI SDK give us
 * the numbers for free.
 */
export type OpenAIUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export type OpenAIChatCompletion = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIChatMessage;
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
    logprobs: null;
  }>;
  usage?: OpenAIUsage;
};

export type OpenAIChatCompletionChunk = {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<OpenAIChatMessage>;
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
    logprobs: null;
  }>;
  usage?: OpenAIUsage;
};

export type OpenAIListEnvelope<T> = {
  object: 'list';
  data: T[];
};

export type OpenAIError = {
  error: {
    message: string;
    type: string;
    code?: string | number | null;
    param?: string | null;
  };
};

/** Current unix timestamp (seconds) — used for OpenAI `created` fields. */
export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Generate an OpenAI-style completion ID. Matches the `chatcmpl-`
 * prefix the real API uses so downstream tooling that keys off the
 * prefix (e.g. grep, log filters) keeps working.
 */
export function chatCompletionId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Generate an OpenAI-style file ID. */
export function fileId(publicId: string): string {
  return `file-${publicId}`;
}

/** Generate an OpenAI-style assistant ID. */
export function assistantId(publicId: string): string {
  return `asst-${publicId}`;
}

/** Generate an OpenAI-style thread ID. */
export function threadId(publicId: string): string {
  return `thread-${publicId}`;
}

/** Generate an OpenAI-style message ID. */
export function messageId(publicId: string): string {
  return `msg-${publicId}`;
}

/** Extract the raw publicId from an OpenAI-style prefixed ID. */
export function stripPrefix(
  prefixedId: string,
  prefix: 'file' | 'asst' | 'thread' | 'msg' | 'chatcmpl',
): string {
  const expected = `${prefix}-`;
  return prefixedId.startsWith(expected)
    ? prefixedId.slice(expected.length)
    : prefixedId;
}

/**
 * Build a non-streaming chat completion response in OpenAI format.
 */
export function buildChatCompletion(params: {
  id?: string;
  model: string;
  content: string;
  usage?: OpenAIUsage;
  finishReason?: 'stop' | 'length' | 'content_filter';
}): OpenAIChatCompletion {
  return {
    id: params.id ?? chatCompletionId(),
    object: 'chat.completion',
    created: nowUnixSeconds(),
    model: params.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: params.content },
        finish_reason: params.finishReason ?? 'stop',
        logprobs: null,
      },
    ],
    usage: params.usage,
  };
}

/**
 * Build one streaming chunk. Callers typically emit:
 * - an opening chunk with `delta: { role: "assistant" }` and no content
 * - N content chunks with `delta: { content: "..." }`
 * - a final chunk with empty delta, `finish_reason: "stop"`, and usage
 */
export function buildChatCompletionChunk(params: {
  id: string;
  model: string;
  delta: Partial<OpenAIChatMessage>;
  finishReason?: 'stop' | 'length' | 'content_filter' | null;
  usage?: OpenAIUsage;
  created?: number;
}): OpenAIChatCompletionChunk {
  return {
    id: params.id,
    object: 'chat.completion.chunk',
    created: params.created ?? nowUnixSeconds(),
    model: params.model,
    choices: [
      {
        index: 0,
        delta: params.delta,
        finish_reason: params.finishReason ?? null,
        logprobs: null,
      },
    ],
    usage: params.usage,
  };
}

/** Build an OpenAI list-envelope (`{ object: "list", data: [...] }`). */
export function buildList<T>(data: T[]): OpenAIListEnvelope<T> {
  return { object: 'list', data };
}

/**
 * Build an OpenAI-style error body. `type` classifies the error for
 * SDKs (e.g. `invalid_request_error`, `authentication_error`,
 * `rate_limit_error`, `api_error`, `internal_error`).
 */
export function buildError(params: {
  message: string;
  type: string;
  code?: string | number | null;
  param?: string | null;
}): OpenAIError {
  return {
    error: {
      message: params.message,
      type: params.type,
      code: params.code ?? null,
      param: params.param ?? null,
    },
  };
}

/** Encode one SSE event line (`data: <json>\n\n`). */
export function encodeSseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** SSE terminator line (`data: [DONE]\n\n`) used by OpenAI streams. */
export const SSE_DONE = 'data: [DONE]\n\n';
