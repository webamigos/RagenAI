import { Injectable, Logger } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type ApiContext } from '../common/types/api-context.js';
import { type ProjectId } from '../common/types/brand.js';
import { RagenAppClient } from '../common/services/ragen-app.client.js';
import {
  buildChatCompletion,
  buildChatCompletionChunk,
  chatCompletionId,
  encodeSseData,
  nowUnixSeconds,
  stripPrefix,
  SSE_DONE,
  type OpenAIChatCompletionChunk,
  type OpenAIUsage,
} from '../common/utils/openai-format.js';
import { type CreateChatCompletionDto } from './dto/create-chat-completion.dto.js';

/**
 * Shape of the non-streaming response ragen-app's
 * `/api/v1/chat/completions` returns. Kept intentionally lean — all the
 * OpenAI-specific formatting happens here in ragen-api.
 */
type UpstreamJson = {
  text: string;
  model: string;
  usage?: OpenAIUsage;
};

/**
 * Shape of each SSE data line from ragen-app. Two kinds are emitted:
 *   - `{ text: "chunk" }` per token batch
 *   - `{ model, usage }` as a single trailer before `[DONE]`
 */
type UpstreamSseEvent =
  | { text: string }
  | { model: string; usage?: OpenAIUsage };

@Injectable()
export class ChatCompletionsService {
  private readonly logger = new Logger(ChatCompletionsService.name);

  constructor(private readonly ragenApp: RagenAppClient) {}

  async create(
    dto: CreateChatCompletionDto,
    context: ApiContext,
    req: Request,
    res: Response,
  ): Promise<void> {
    const isStream = dto.stream === true;
    const includeUsage =
      !isStream || dto.stream_options?.include_usage === true;

    // Resolve projectId from assistant_id (strips asst- prefix if present)
    const resolvedProjectId = stripPrefix(
      dto.assistant_id,
      'asst',
    ) as ProjectId;
    const resolvedContext: ApiContext = {
      ...context,
      projectId: resolvedProjectId,
    };

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const upstream = await this.ragenApp.request({
      method: 'POST',
      path: '/api/v1/chat/completions',
      context: resolvedContext,
      body: {
        messages: dto.messages,
        model: dto.model,
        temperature: dto.temperature,
        max_tokens: dto.max_tokens,
        stream: isStream,
        assistant_id: dto.assistant_id,
      },
      signal: abortController.signal,
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      res
        .status(upstream.status)
        .type('application/json')
        .send(
          body ||
            JSON.stringify({
              error: {
                message: `Upstream error (${upstream.status})`,
                type: 'api_error',
                code: upstream.status,
                param: null,
              },
            }),
        );
      return;
    }

    if (isStream) {
      await this.pipeStream(upstream, dto, res, abortController, includeUsage);
    } else {
      await this.sendJson(upstream, dto, res);
    }
  }

  private async sendJson(
    upstream: globalThis.Response,
    dto: CreateChatCompletionDto,
    res: Response,
  ): Promise<void> {
    let body: UpstreamJson;
    try {
      body = (await upstream.json()) as UpstreamJson;
    } catch {
      this.logger.error('Invalid JSON body from ragen-app');
      res.status(502).json({
        error: {
          message: 'Invalid upstream response',
          type: 'api_error',
          code: 502,
          param: null,
        },
      });
      return;
    }

    // OpenAI returns 200 (not NestJS's default 201 for POST).
    res.status(200).json(
      buildChatCompletion({
        model: body.model || dto.model || 'ragen',
        content: body.text,
        usage: body.usage,
      }),
    );
  }

  /**
   * Wrap ragen-app's ragen-native SSE stream in OpenAI chat-completion
   * chunk format. Flow:
   *   1. Emit an opening chunk with `delta: { role: "assistant" }`.
   *   2. For each upstream `{ text: "chunk" }`, emit a chunk with
   *      `delta: { content: "chunk" }`.
   *   3. Upstream's trailing `{ usage, model }` event is captured — we
   *      use it to decide the final chunks.
   *   4. Emit a final chunk with empty delta and `finish_reason: "stop"`.
   *   5. If `include_usage` was requested, emit a separate usage-only
   *      chunk with `choices: []` and `usage` — matching OpenAI's real
   *      wire format (usage does NOT ride on the `finish_reason` chunk).
   *   6. Emit `data: [DONE]\n\n`.
   *
   * All chunks share one `chatcmpl-<id>` so clients can correlate them.
   * On client abort (`req.on('close')`), the `finally` block short-
   * circuits to avoid writing to an already-ended response.
   */
  private async pipeStream(
    upstream: globalThis.Response,
    dto: CreateChatCompletionDto,
    res: Response,
    abortController: AbortController,
    includeUsage: boolean,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Encoding', 'none');
    res.flushHeaders();

    if (!upstream.body) {
      res.end();
      return;
    }

    const id = chatCompletionId();
    const created = nowUnixSeconds();
    // Use `||` (not `??`) so an empty-string `model` falls through to
    // the placeholder — consistent with sendJson() below and with how
    // OpenAI SDKs treat absent model values.
    let modelForChunks = dto.model || 'ragen';
    let finalUsage: OpenAIUsage | undefined;

    // Opening chunk — role assignment only, per OpenAI convention.
    res.write(
      encodeSseData(
        buildChatCompletionChunk({
          id,
          model: modelForChunks,
          created,
          delta: { role: 'assistant' },
        }),
      ),
    );

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // SSE is line-delimited with `\n\n` terminating each event.
        // Split on `\n\n`, process complete events, keep the tail.
        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = this.parseSseEvent(rawEvent);
          if (parsed === 'DONE') {
            // Upstream's [DONE] — we emit our own terminator below.
            buffer = '';
            break;
          }
          if (parsed && 'text' in parsed) {
            res.write(
              encodeSseData(
                buildChatCompletionChunk({
                  id,
                  model: modelForChunks,
                  created,
                  delta: { content: parsed.text },
                }),
              ),
            );
          } else if (parsed && 'model' in parsed) {
            modelForChunks = parsed.model || modelForChunks;
            finalUsage = parsed.usage;
          }
          sep = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Stream read error: ${message}`);
      }
    } finally {
      // Guard against writing to a closed/aborted response — happens on
      // client disconnect (req.on('close') → abortController.abort() →
      // reader.read() throws AbortError → `finally` was previously
      // writing to an ended response, logging "write after end" errors).
      if (!res.writableEnded && !abortController.signal.aborted) {
        // Finish chunk — empty delta + stop reason. No usage here;
        // per OpenAI's wire format usage goes on its own chunk below.
        res.write(
          encodeSseData(
            buildChatCompletionChunk({
              id,
              model: modelForChunks,
              created,
              delta: {},
              finishReason: 'stop',
            }),
          ),
        );

        // Usage chunk — only emitted when caller asked for it (OpenAI's
        // `stream_options.include_usage: true`). `choices: []` is
        // intentional: that's how the real OpenAI API signals
        // "this chunk carries usage, not content."
        if (includeUsage && finalUsage) {
          const usageChunk: OpenAIChatCompletionChunk = {
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelForChunks,
            choices: [],
            usage: finalUsage,
          };
          res.write(encodeSseData(usageChunk));
        }

        res.write(SSE_DONE);
        res.end();
      }
    }
  }

  /**
   * Parse a single SSE event block. Returns:
   *  - `'DONE'` on `data: [DONE]`
   *  - an `UpstreamSseEvent` on valid JSON data line
   *  - `null` on malformed / comment / unknown lines
   */
  private parseSseEvent(raw: string): UpstreamSseEvent | 'DONE' | null {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith(':')) {
      return null;
    }

    // Event may span multiple `data:` lines in theory; in practice
    // ragen-app emits one per event. Handle both defensively.
    const dataLines = trimmed
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice('data:'.length).trim());

    if (dataLines.length === 0) {
      return null;
    }

    // SSE spec: multi-line `data:` fields join with `\n`. ragen-app
    // currently emits single-line payloads but any future change would
    // silently corrupt JSON otherwise.
    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
      return 'DONE';
    }

    try {
      return JSON.parse(payload) as UpstreamSseEvent;
    } catch {
      return null;
    }
  }
}
