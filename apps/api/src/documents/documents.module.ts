import { Module } from '@nestjs/common';
import { GetImportedKbFileIdsService } from './get-imported-kb-file-ids.service.js';
import { FoldersService } from './folders.service.js';
import { FilesService } from './files.service.js';
import { DocumentPermissionsService } from './document-permissions.service.js';
import { VectorPermissionsService } from './vector-permissions.service.js';
import { DocumentEncryptionService } from './document-encryption.service.js';
import { KnowledgeAnalyticsService } from './knowledge-analytics.service.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [AuditLogsModule, NotificationsModule, ProjectsModule],
  providers: [
    GetImportedKbFileIdsService,
    FoldersService,
    FilesService,
    DocumentPermissionsService,
    VectorPermissionsService,
    DocumentEncryptionService,
    KnowledgeAnalyticsService,
  ],
  exports: [
    GetImportedKbFileIdsService,
    FoldersService,
    FilesService,
    DocumentPermissionsService,
    VectorPermissionsService,
    DocumentEncryptionService,
    KnowledgeAnalyticsService,
  ],
})
export class DocumentsModule {}
