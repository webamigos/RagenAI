import { Module } from '@nestjs/common';
import { GetImportedKbFileIdsService } from './get-imported-kb-file-ids.service.js';
import { FoldersService } from './folders.service.js';
import { FilesService } from './files.service.js';
import { DocumentPermissionsService } from './document-permissions.service.js';
import { VectorPermissionsService } from './vector-permissions.service.js';
import { DocumentEncryptionService } from './document-encryption.service.js';
import { KnowledgeAnalyticsService } from './knowledge-analytics.service.js';
import { DeleteFileFromVectorStoreService } from './delete-file-from-vector-store.service.js';
import { UploadFileService } from './upload-file.service.js';
import { DeleteFileService } from './delete-file.service.js';
import { FoldersController } from './folders.controller.js';
import { DocumentsController } from './documents.controller.js';
import { KnowledgeAnalyticsController } from './knowledge-analytics.controller.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { TemporalModule } from '../temporal/temporal.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  imports: [
    AuditLogsModule,
    NotificationsModule,
    ProjectsModule,
    OrganizationsModule,
    StorageModule,
    TemporalModule,
    SubscriptionsModule,
  ],
  controllers: [
    FoldersController,
    DocumentsController,
    KnowledgeAnalyticsController,
  ],
  providers: [
    GetImportedKbFileIdsService,
    FoldersService,
    FilesService,
    DocumentPermissionsService,
    VectorPermissionsService,
    DocumentEncryptionService,
    KnowledgeAnalyticsService,
    DeleteFileFromVectorStoreService,
    UploadFileService,
    DeleteFileService,
  ],
  exports: [
    GetImportedKbFileIdsService,
    FoldersService,
    FilesService,
    DocumentPermissionsService,
    VectorPermissionsService,
    DocumentEncryptionService,
    KnowledgeAnalyticsService,
    DeleteFileFromVectorStoreService,
    UploadFileService,
    DeleteFileService,
  ],
})
export class DocumentsModule {}
