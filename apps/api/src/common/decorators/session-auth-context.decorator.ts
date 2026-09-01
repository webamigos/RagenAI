import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
  SESSION_AUTH_CONTEXT_KEY,
  type SessionAuthContext,
} from '../types/session-auth-context.js';

export const GetSessionAuthContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionAuthContext => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    return request[SESSION_AUTH_CONTEXT_KEY] as SessionAuthContext;
  },
);
