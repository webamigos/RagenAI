import { Injectable, Logger } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type ApiContext } from '../common/types/api-context.js';
import { type ProjectId } from '../common/types/brand.js';
import { RagenAppClient } from '../common/services/ragen-app.client.js';
import { stripPrefix } from '../common/utils/openai-format.js';
import { type ChatDto } from './dto/chat.dto.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly ragenApp: RagenAppClient) {}

  async chat(dto: ChatDto, context: ApiContext, req: Request, res: Response) {
    const isStream = dto.stream === true;

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

    let upstream: globalThis.Response;
    try {
      upstream = await this.ragenApp.request({
        method: 'POST',
        path: '/api/v1/chat',
        context: resolvedContext,
        body: {
          prompt: dto.content,
          context: dto.context,
          stream: isStream,
          assistant_id: dto.assistant_id,
          reasoning_effort: dto.reasoning_effort,
        },
        signal: abortController.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }
      res.status(502).json({ error: 'Upstream service unavailable' });
      return;
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => 'Unknown error');
      res.status(upstream.status).send(text);
      return;
    }

    if (isStream) {
      // SSE streaming: pipe directly
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Content-Encoding', 'none');
      res.flushHeaders();

      if (!upstream.body) {
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          res.write(value);
        }
      } catch {
        // Client disconnected or upstream error
      } finally {
        res.end();
      }
    } else {
      // JSON response: forward as-is
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = await upstream.json();
        res.json(data);
      } catch {
        this.logger.error('Failed to parse JSON from upstream');
        res.status(502).json({ error: 'Invalid JSON from upstream' });
      }
    }
  }
}
