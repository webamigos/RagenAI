import { Module } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';
import { RagEngineModule } from '../rag-engine/rag-engine.module.js';

/**
 * `RagEngineModule` already re-exports everything this needs — ChainsModule
 * (InitializeBasicRagService), OrganizationsModule, TeamsModule
 * (ResolveLiteLLMKeyService), ApiLimitsModule, AiUsageModule — the same
 * pattern `ChatModule` uses. `PrismaService` needs no import: `PrismaModule`
 * is global.
 */
@Module({
  imports: [RagEngineModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
