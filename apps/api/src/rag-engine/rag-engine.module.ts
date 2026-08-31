import { Module } from '@nestjs/common';
import { AiUsageModule } from '../ai-usage/ai-usage.module.js';
import { ChainsModule } from '../chains/chains.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { TeamsModule } from '../teams/teams.module.js';
import { ApiLimitsModule } from '../api-limits/api-limits.module.js';
import { ConnectorsModule } from '../connectors/connectors.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SecurityModule } from '../security/security.module.js';
import { McpModule } from '../mcp/mcp.module.js';

/**
 * Anchor module for the ported (but not yet wired into any controller) RAG
 * engine: ../llm/, ../litellm/, ../vector-store/, ../reranker/, ../chains/,
 * ../mcp/, ../ragen-vault/, ../security/ — see
 * docs/adrs/21-monorepo-and-api-decoupling.md, Phase B.
 *
 * llm/litellm/vector-store/reranker/chains' basic-rag+utils/mcp/ragen-vault
 * are plain, framework-agnostic TS (static factory classes / functions),
 * not NestJS providers — nothing to register here for them; future callers
 * import directly from those directories. AiUsageModule, ChainsModule (the
 * initializeBasicRag equivalent), OrganizationsModule, DocumentsModule,
 * TeamsModule, ApiLimitsModule, ConnectorsModule, ProjectsModule,
 * SecurityModule, and McpModule (LoadMcpToolsService) are the real NestJS
 * pieces (DB-backed, DI-based), re-exported here so a later controller can
 * pull in just `RagEngineModule` once this actually gets wired up.
 */
@Module({
  imports: [
    AiUsageModule,
    ChainsModule,
    OrganizationsModule,
    DocumentsModule,
    TeamsModule,
    ApiLimitsModule,
    ConnectorsModule,
    ProjectsModule,
    SecurityModule,
    McpModule,
  ],
  exports: [
    AiUsageModule,
    ChainsModule,
    OrganizationsModule,
    DocumentsModule,
    TeamsModule,
    ApiLimitsModule,
    ConnectorsModule,
    ProjectsModule,
    SecurityModule,
    McpModule,
  ],
})
export class RagEngineModule {}
