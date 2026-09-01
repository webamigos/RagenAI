import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Response } from 'express';
import { buildError } from '../utils/openai-format.js';
import { RagenAppError } from '../services/ragen-app.client.js';

/**
 * Exception filter for OpenAI-compatible endpoints. Returns the
 * `{ error: { message, type, code, param } }` envelope the OpenAI SDK
 * expects (so its `openai.BadRequestError` / `openai.AuthenticationError`
 * classification keeps working against ragen-api).
 *
 * Apply per-controller (or per-handler) with `@UseFilters(OpenAiExceptionFilter)`.
 * The global `ApiExceptionFilter` keeps handling non-OpenAI routes with
 * the ragen-native error shape.
 */
@Catch()
export class OpenAiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(OpenAiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Upstream ragen-app error — surface its status; classify type by
    // status code family.
    if (exception instanceof RagenAppError) {
      const body = this.parseUpstreamBody(exception.body);
      const type = this.classifyByStatus(exception.status);
      response.status(exception.status).json(
        buildError({
          message: body.message ?? `Upstream error (${exception.status})`,
          type,
          code: body.code ?? null,
        }),
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      const message = this.extractMessage(resp);
      response.status(status).json(
        buildError({
          message,
          type: this.classifyByStatus(status),
          code: status,
        }),
      );
      return;
    }

    this.logger.error('Unhandled error on OpenAI route:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      buildError({
        message: 'Internal server error',
        type: 'internal_error',
      }),
    );
  }

  private classifyByStatus(status: number): string {
    if (status === 400) {
      return 'invalid_request_error';
    }
    if (status === 401) {
      return 'authentication_error';
    }
    if (status === 403) {
      return 'permission_error';
    }
    if (status === 404) {
      return 'not_found_error';
    }
    if (status === 429) {
      return 'rate_limit_error';
    }
    if (status >= 500) {
      return 'api_error';
    }
    return 'invalid_request_error';
  }

  private extractMessage(resp: unknown): string {
    if (typeof resp === 'string') {
      return resp;
    }
    if (resp && typeof resp === 'object' && 'message' in resp) {
      const msg = resp.message;
      if (typeof msg === 'string') {
        return msg;
      }
      if (Array.isArray(msg)) {
        return msg.join('; ');
      }
    }
    return 'Request failed';
  }

  /**
   * Extract a useful error message + code from ragen-app's response
   * body. Supports all three shapes that occur in practice:
   *   1. `{ error: "plain string" }` (ragen-app's legacy shape)
   *   2. `{ error: { message, type, code, ... } }` (OpenAI-shaped,
   *       emitted by OpenAiExceptionFilter when ragen-app runs through
   *       the same filter)
   *   3. `{ message: "...", code: ... }` (NestJS default HttpException)
   */
  private parseUpstreamBody(body: string): {
    message?: string;
    code?: string | number | null;
  } {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;

        // Shape 2: `{ error: { message, code } }` — OpenAI-style
        if (obj.error && typeof obj.error === 'object') {
          const errObj = obj.error as Record<string, unknown>;
          const message =
            typeof errObj.message === 'string' ? errObj.message : undefined;
          const code =
            typeof errObj.code === 'string' || typeof errObj.code === 'number'
              ? errObj.code
              : null;
          return { message, code };
        }

        // Shape 1: `{ error: "plain string" }` and/or Shape 3
        const message =
          typeof obj.error === 'string'
            ? obj.error
            : typeof obj.message === 'string'
              ? obj.message
              : undefined;
        const code =
          typeof obj.code === 'string' || typeof obj.code === 'number'
            ? obj.code
            : null;
        return { message, code };
      }
    } catch {
      // Fall through — body wasn't JSON.
    }
    return { message: body || undefined };
  }
}
