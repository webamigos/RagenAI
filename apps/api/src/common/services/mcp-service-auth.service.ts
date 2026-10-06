import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyMcpServiceAssertion } from '@ragenai/crypto/mcp-service';

@Injectable()
export class McpServiceAuthService {
  private readonly enabled: boolean;
  private readonly secret: string | undefined;
  constructor(config: ConfigService) {
    this.enabled = config.get<string>('MCP_OAUTH_ENABLED') === 'true';
    this.secret = config.get<string>('MCP_SERVICE_SECRET');
    if (this.enabled && (!this.secret || this.secret.length < 32)) {
      throw new Error('MCP_SERVICE_SECRET must contain at least 32 characters');
    }
    if (
      this.secret &&
      this.secret === config.get<string>('SESSION_AUTH_SECRET')
    ) {
      throw new Error(
        'MCP_SERVICE_SECRET must differ from SESSION_AUTH_SECRET',
      );
    }
  }
  verify(token: string) {
    return this.enabled ? verifyMcpServiceAssertion(token, this.secret) : null;
  }
}
