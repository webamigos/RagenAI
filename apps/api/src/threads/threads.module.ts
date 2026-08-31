import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller.js';
import { ThreadCoreController } from './thread-core.controller.js';
import { ThreadsService } from './threads.service.js';
import { MessagesService } from './messages.service.js';
import { PersistApiThreadService } from './persist-api-thread.service.js';
import { ThreadsCoreService } from './thread-core.service.js';
import { ThreadSharingService } from './thread-sharing.service.js';
import { ThreadEncryptionService } from './thread-encryption.service.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { MessagesModule } from '../messages/messages.module.js';

@Module({
  imports: [
    AuditLogsModule,
    NotificationsModule,
    ProjectsModule,
    MessagesModule,
  ],
  controllers: [ThreadsController, ThreadCoreController],
  providers: [
    ThreadsService,
    MessagesService,
    PersistApiThreadService,
    ThreadsCoreService,
    ThreadSharingService,
    ThreadEncryptionService,
  ],
  exports: [
    PersistApiThreadService,
    ThreadsCoreService,
    ThreadSharingService,
    ThreadEncryptionService,
  ],
})
export class ThreadsModule {}
