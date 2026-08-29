import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_RESPONSE_TRANSFORM } from '../decorators/skip-response-transform.decorator.js';

/**
 * Transforms responses to replace internal `public_id` with `id` for API consumers,
 * and converts Date objects to ISO strings.
 *
 * Handlers/controllers annotated with `@SkipResponseTransform()` are bypassed
 * entirely — used by OpenAI-compatible endpoints that produce their own
 * response shapes and must keep their `id` fields verbatim.
 */
@Injectable()
export class ReplaceIdsInterceptor implements NestInterceptor {
  constructor(private readonly reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.reflector) {
      const skip = this.reflector.getAllAndOverride<boolean>(
        SKIP_RESPONSE_TRANSFORM,
        [context.getHandler(), context.getClass()],
      );
      if (skip) {
        return next.handle();
      }
    }
    return next.handle().pipe(map((data: unknown) => this.transform(data)));
  }

  private transform(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data.map((item: unknown) => this.transform(item));
    }

    if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        data as Record<string, unknown>,
      )) {
        if (key === 'public_id') {
          result['id'] = value;
        } else if (
          key === 'id' ||
          key === 'organization_id' ||
          key === 'project_id'
        ) {
          // Skip internal IDs
          continue;
        } else if (value instanceof Date) {
          result[key] = value.toISOString();
        } else {
          result[key] = this.transform(value);
        }
      }
      return result;
    }

    return data;
  }
}
