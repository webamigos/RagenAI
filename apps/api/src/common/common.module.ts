import { ProjectsModule } from '../projects/projects.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { McpServiceAuthService } from './services/mcp-service-auth.service.js';
import { McpServiceGuard } from './guards/mcp-service.guard.js';
import { McpOrApiKeyGuard } from './guards/mcp-or-api-key.guard.js';
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeysService } from './services/api-keys.service.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { RagenWebClient } from './services/ragen-web.client.js';
import { SessionAuthService } from './services/session-auth.service.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { AssistantScopeService } from './services/assistant-scope.service.js';

@Global()
@Module({
  imports: [ConfigModule, ProjectsModule, SubscriptionsModule],
  providers: [
    ApiKeysService,
    ApiKeyGuard,
    McpServiceAuthService,
    McpServiceGuard,
    McpOrApiKeyGuard,
    RagenWebClient,
    SessionAuthService,
    SessionAuthGuard,
    AssistantScopeService,
  ],
  exports: [
    ApiKeysService,
    ApiKeyGuard,
    McpServiceAuthService,
    McpServiceGuard,
    McpOrApiKeyGuard,
    RagenWebClient,
    SessionAuthService,
    SessionAuthGuard,
    AssistantScopeService,
  ],
})
export class CommonModule {}
