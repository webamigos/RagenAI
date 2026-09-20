import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { CatalogueService } from './catalogue.service.js';
import { GetEnabledConnectorsService } from './get-enabled-connectors.service.js';
import { GetAvailableConnectorsService } from './get-available-connectors.service.js';
import { ConnectorsService } from './connectors.service.js';
import { ConnectorsController } from './connectors.controller.js';

@Module({
  imports: [OrganizationsModule, AuditLogsModule, SubscriptionsModule],
  controllers: [ConnectorsController],
  providers: [
    CatalogueService,
    GetEnabledConnectorsService,
    GetAvailableConnectorsService,
    ConnectorsService,
  ],
  exports: [
    CatalogueService,
    GetEnabledConnectorsService,
    GetAvailableConnectorsService,
    ConnectorsService,
  ],
})
export class ConnectorsModule {}
