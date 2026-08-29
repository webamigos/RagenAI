/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return */
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { type Request, type Response } from 'express';
import { ChatCompletionsService } from './chat-completions.service.js';
import { RagenAppClient } from '../common/services/ragen-app.client.js';
import { type ApiContext } from '../common/types/api-context.js';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '../common/types/brand.js';
import { type CreateChatCompletionDto } from './dto/create-chat-completion.dto.js';

describe('ChatCompletionsService', () => {
  const context: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    projectId: 'proj-1' as ProjectId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
  };

  function buildService() {
    const configService = {
      getOrThrow: jest.fn((key: string) =>
        key === 'RAGEN_APP_INTERNAL_URL'
          ? 'http://ragen-app:3000'
          : 'test-secret',
      ),
    } as unknown as ConfigService;
    const client = new RagenAppClient(configService);
    return new ChatCompletionsService(client);
  }

  function mockReq(): Request {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { headers: {} }) as unknown as Request;
  }

  function mockRes() {
    const chunks: string[] = [];
    const res: Record<string, jest.Mock> = {};
    res.setHeader = jest.fn();
    res.flushHeaders = jest.fn();
    res.status = jest.fn().mockReturnValue(res);
    res.type = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.write = jest.fn((c: string) => {
      chunks.push(c);
      return true;
    });
    res.end = jest.fn();
    return { res: res as unknown as Response, chunks };
  }

  function sseStream(lines: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      },
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('non-streaming', () => {
    it('wraps upstream JSON in OpenAI chat.completion object', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            text: 'Hello!',
            model: 'gpt-5.4',
            usage: {
              prompt_tokens: 10,
              completion_tokens: 2,
              total_tokens: 12,
            },
          }),
          { status: 200 },
        ),
      );

      const service = buildService();
      const { res } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      await service.create(dto, context, mockReq(), res);

      expect(res.json).toHaveBeenCalledTimes(1);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body).toMatchObject({
        object: 'chat.completion',
        model: 'gpt-5.4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      });
      expect(body.id).toMatch(/^chatcmpl-/);
    });

    it('forwards upstream error body on non-2xx', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'gone' }), { status: 404 }),
        );

      const service = buildService();
      const { res } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      await service.create(dto, context, mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('streaming', () => {
    it('translates upstream SSE text chunks to OpenAI chunk format (no usage by default)', async () => {
      const body = sseStream([
        'data: {"text":"Hello "}\n\n',
        'data: {"text":"world"}\n\n',
        'data: {"model":"gpt-5.4","usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
        'data: [DONE]\n\n',
      ]);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(body, { status: 200 }));

      const service = buildService();
      const { res, chunks } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      await service.create(dto, context, mockReq(), res);

      // Opening chunk
      expect(chunks[0]).toContain('"delta":{"role":"assistant"}');
      // Content chunks
      expect(
        chunks.some((c) => c.includes('"delta":{"content":"Hello "}')),
      ).toBe(true);
      expect(
        chunks.some((c) => c.includes('"delta":{"content":"world"}')),
      ).toBe(true);
      // Final chunk with finish_reason, NO usage on it (OpenAI shape).
      const final = chunks.find((c) => c.includes('"finish_reason":"stop"'));
      expect(final).toBeDefined();
      expect(final).not.toContain('"usage"');
      // No separate usage chunk either — caller didn't opt in.
      expect(chunks.every((c) => !c.includes('"choices":[]'))).toBe(true);
      // Terminator
      expect(chunks[chunks.length - 1]).toBe('data: [DONE]\n\n');
    });

    it('emits a separate usage chunk with choices:[] when stream_options.include_usage is true', async () => {
      const body = sseStream([
        'data: {"text":"Hi"}\n\n',
        'data: {"model":"gpt-5.4","usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
        'data: [DONE]\n\n',
      ]);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(body, { status: 200 }));

      const service = buildService();
      const { res, chunks } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
        stream_options: { include_usage: true },
      };

      await service.create(dto, context, mockReq(), res);

      // Finish chunk still has no usage.
      const finish = chunks.find((c) => c.includes('"finish_reason":"stop"'));
      expect(finish).toBeDefined();
      expect(finish).not.toContain('"usage"');

      // Dedicated usage-only chunk with empty choices[].
      const usageChunk = chunks.find((c) => c.includes('"choices":[]'));
      expect(usageChunk).toBeDefined();
      expect(usageChunk).toContain(
        '"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}',
      );
      // Must come after the finish chunk but before [DONE].
      const finishIdx = chunks.findIndex((c) =>
        c.includes('"finish_reason":"stop"'),
      );
      const usageIdx = chunks.findIndex((c) => c.includes('"choices":[]'));
      const doneIdx = chunks.findIndex((c) => c === 'data: [DONE]\n\n');
      expect(finishIdx).toBeLessThan(usageIdx);
      expect(usageIdx).toBeLessThan(doneIdx);
    });

    it('does not write to response after client disconnect / abort', async () => {
      // Upstream stalls indefinitely; we abort via a fake close event.
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      const req = mockReq();

      const neverEnding = new ReadableStream({
        start(controller) {
          // Keep the stream open. We trigger abort after setup below.
          setTimeout(() => controller.close(), 50);
        },
      });
      fetchSpy.mockResolvedValue(new Response(neverEnding, { status: 200 }));

      const service = buildService();
      const { res, chunks } = mockRes();
      // Simulate an already-ended response (as if req.on('close') fired
      // and the HTTP layer cleaned up) by marking writableEnded true.
      (res as unknown as { writableEnded: boolean }).writableEnded = true;

      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      await service.create(dto, context, req, res);

      // No [DONE] terminator should have been written — we detected the
      // ended response and short-circuited the finally block.
      expect(chunks.includes('data: [DONE]\n\n')).toBe(false);
    });

    it('emits chat.completion.chunk object type on every chunk', async () => {
      const body = sseStream(['data: {"text":"Hi"}\n\n', 'data: [DONE]\n\n']);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(body, { status: 200 }));

      const service = buildService();
      const { res, chunks } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      await service.create(dto, context, mockReq(), res);

      // All data events should be chat.completion.chunk objects.
      const events = chunks
        .filter((c) => c.startsWith('data: {'))
        .map((c) => {
          const json = c.replace(/^data: /, '').replace(/\n\n$/, '');
          return JSON.parse(json);
        });
      expect(events.every((e) => e.object === 'chat.completion.chunk')).toBe(
        true,
      );
      // All chunks share the same completion id.
      const ids = new Set(events.map((e) => e.id));
      expect(ids.size).toBe(1);
    });

    it('handles upstream chunks split across read boundaries', async () => {
      // Simulate a provider that flushes mid-event.
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"te'));
          controller.enqueue(encoder.encode('xt":"Hello"}\n'));
          controller.enqueue(encoder.encode('\ndata: [DONE]\n\n'));
          controller.close();
        },
      });
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(body, { status: 200 }));

      const service = buildService();
      const { res, chunks } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      await service.create(dto, context, mockReq(), res);

      expect(chunks.some((c) => c.includes('"content":"Hello"'))).toBe(true);
    });

    it('sets SSE response headers', async () => {
      const body = sseStream(['data: [DONE]\n\n']);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(body, { status: 200 }));

      const service = buildService();
      const { res } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      await service.create(dto, context, mockReq(), res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream; charset=utf-8',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache, no-transform',
      );
      expect(res.flushHeaders).toHaveBeenCalled();
    });
  });

  describe('request body translation', () => {
    it('forwards messages/model/temperature/max_tokens/stream to ragen-app', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ text: 'hi', model: 'gpt-5.4' }), {
          status: 200,
        }),
      );

      const service = buildService();
      const { res } = mockRes();
      const dto: CreateChatCompletionDto = {
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-5.4',
        temperature: 0.3,
        max_tokens: 128,
        stream: false,
      };

      await service.create(dto, context, mockReq(), res);

      const sent = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(sent).toEqual({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-5.4',
        temperature: 0.3,
        max_tokens: 128,
        stream: false,
        assistant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });
    });
  });
});
