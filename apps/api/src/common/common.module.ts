import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeysService } from './services/api-keys.service.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { RagenAppClient } from './services/ragen-app.client.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ApiKeysService, ApiKeyGuard, RagenAppClient],
  exports: [ApiKeysService, ApiKeyGuard, RagenAppClient],
})
export class CommonModule {}
