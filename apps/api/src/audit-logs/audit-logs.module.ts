import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';

@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogsModule {}
