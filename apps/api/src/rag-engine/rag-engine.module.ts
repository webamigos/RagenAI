import { Module } from '@nestjs/common';
import { AiUsageModule } from '../ai-usage/ai-usage.module.js';

/**
 * Anchor module for the ported (but not yet wired into any controller) RAG
 * engine: ../llm/, ../litellm/, ../vector-store/, ../reranker/ — see
 * docs/adrs/21-monorepo-and-api-decoupling.md, Phase B (libs-only step).
 *
 * llm/litellm/vector-store/reranker are plain, framework-agnostic TS
 * (static factory classes / functions), not NestJS providers — nothing to
 * register here for them; future callers import directly from those
 * directories. AiUsageModule is the one real NestJS piece (needs
 * PrismaService via DI), re-exported here so a later controller can pull in
 * just `RagEngineModule` once this actually gets wired up.
 */
@Module({
  imports: [AiUsageModule],
  exports: [AiUsageModule],
})
export class RagEngineModule {}
