import { Module } from '@nestjs/common';
import { ResolveLiteLLMKeyService } from './resolve-litellm-key.service.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';

@Module({
  imports: [OrganizationsModule],
  providers: [ResolveLiteLLMKeyService],
  exports: [ResolveLiteLLMKeyService],
})
export class TeamsModule {}
