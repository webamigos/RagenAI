import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';
import { SessionAuthService } from '../services/session-auth.service.js';
import { SESSION_AUTH_CONTEXT_KEY } from '../types/session-auth-context.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * Guards routes callable only by ragen-app on behalf of an already
 * session-authenticated user (server-to-server, not end-user-facing).
 * See SessionAuthService for the token format/verification.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionAuthService: SessionAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.slice(BEARER_PREFIX.length);
    const sessionAuthContext = this.sessionAuthService.verify(token);

    if (!sessionAuthContext) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    (request as unknown as Record<string, unknown>)[SESSION_AUTH_CONTEXT_KEY] =
      sessionAuthContext;

    return true;
  }
}
