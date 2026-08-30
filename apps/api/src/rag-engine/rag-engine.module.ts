import { Module } from '@nestjs/common';
import { AiUsageModule } from '../ai-usage/ai-usage.module.js';
import { ChainsModule } from '../chains/chains.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { ApiLimitsModule } from '../api-limits/api-limits.module.js';

/**
 * Anchor module for the ported (but not yet wired into any controller) RAG
 * engine: ../llm/, ../litellm/, ../vector-store/, ../reranker/, ../chains/
 * — see docs/adrs/21-monorepo-and-api-decoupling.md, Phase B.
 *
 * llm/litellm/vector-store/reranker/chains' basic-rag+utils are plain,
 * framework-agnostic TS (static factory classes / functions), not NestJS
 * providers — nothing to register here for them; future callers import
 * directly from those directories. AiUsageModule, ChainsModule (the
 * initializeBasicRag equivalent), OrganizationsModule, DocumentsModule,
 * TeamsModule, and ApiLimitsModule are the real NestJS pieces (DB-backed,
 * DI-based), re-exported here so a later controller can pull in just
 * `RagEngineModule` once this actually gets wired up.
 */
@Module({
  imports: [
    AiUsageModule,
    ChainsModule,
    OrganizationsModule,
    DocumentsModule,
    TeamsModule,
    ApiLimitsModule,
  ],
  exports: [
    AiUsageModule,
    ChainsModule,
    OrganizationsModule,
    DocumentsModule,
    TeamsModule,
    ApiLimitsModule,
  ],
})
export class RagEngineModule {}
