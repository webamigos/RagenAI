import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { GetEnabledConnectorsService } from './get-enabled-connectors.service.js';
import { GetAvailableConnectorsService } from './get-available-connectors.service.js';
import { ConnectorsService } from './connectors.service.js';

@Module({
  imports: [OrganizationsModule, AuditLogsModule, SubscriptionsModule],
  providers: [
    GetEnabledConnectorsService,
    GetAvailableConnectorsService,
    ConnectorsService,
  ],
  exports: [
    GetEnabledConnectorsService,
    GetAvailableConnectorsService,
    ConnectorsService,
  ],
})
export class ConnectorsModule {}
