import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service.js';
import { GetProjectMcpProvidersService } from './get-project-mcp-providers.service.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  imports: [AuditLogsModule, NotificationsModule, SubscriptionsModule],
  providers: [ProjectsService, GetProjectMcpProvidersService],
  exports: [ProjectsService, GetProjectMcpProvidersService],
})
export class ProjectsModule {}
