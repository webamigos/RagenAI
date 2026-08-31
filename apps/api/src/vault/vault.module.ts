import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VaultClient } from './vault.client.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [VaultClient],
  exports: [VaultClient],
})
export class VaultModule {}
