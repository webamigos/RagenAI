import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { API_CONTEXT_KEY, type ApiContext } from '../types/api-context.js';

export const GetApiContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiContext => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    return request[API_CONTEXT_KEY] as ApiContext;
  },
);
