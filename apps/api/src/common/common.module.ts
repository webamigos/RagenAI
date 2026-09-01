import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeysService } from './services/api-keys.service.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { RagenAppClient } from './services/ragen-app.client.js';
import { SessionAuthService } from './services/session-auth.service.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    ApiKeysService,
    ApiKeyGuard,
    RagenAppClient,
    SessionAuthService,
    SessionAuthGuard,
  ],
  exports: [
    ApiKeysService,
    ApiKeyGuard,
    RagenAppClient,
    SessionAuthService,
    SessionAuthGuard,
  ],
})
export class CommonModule {}
