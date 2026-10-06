import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { type Request } from 'express';
import { ApiKeyGuard } from './api-key.guard.js';
import { McpServiceGuard } from './mcp-service.guard.js';

/** Deterministic credential routing; a failed MCP assertion never falls back. */
@Injectable()
export class McpOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyGuard,
    private readonly mcp: McpServiceGuard,
  ) {}
  canActivate(context: ExecutionContext): Promise<boolean> {
    const header = context.switchToHttp().getRequest<Request>()
      .headers.authorization;
    return header?.startsWith('Bearer mcp.')
      ? this.mcp.canActivate(context)
      : this.apiKeys.canActivate(context);
  }
}
