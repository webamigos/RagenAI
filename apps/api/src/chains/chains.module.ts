import { Module } from '@nestjs/common';
import { InitializeBasicRagService } from './basic-rag/initialize-basic-rag.service.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { DocumentsModule } from '../documents/documents.module.js';

/**
 * `basic-rag/{chain,config,operations}.ts`, `types/`, and
 * `utils/{chain-utils,constants,stream-mapper,thread-document-retriever}.ts`
 * are plain, framework-agnostic TS (functions / a class constructed with
 * `new`, not NestJS providers) — nothing to register here for them, callers
 * import directly. InitializeBasicRagService is the one real NestJS piece
 * (needs OrganizationSettingsService/GetOrganizationMetadataService/
 * GetImportedKbFileIdsService via DI). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Module({
  imports: [OrganizationsModule, DocumentsModule],
  providers: [InitializeBasicRagService],
  exports: [InitializeBasicRagService],
})
export class ChainsModule {}
