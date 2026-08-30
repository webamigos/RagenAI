import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { GetEnabledConnectorsService } from './get-enabled-connectors.service.js';
import { GetAvailableConnectorsService } from './get-available-connectors.service.js';

@Module({
  imports: [OrganizationsModule],
  providers: [GetEnabledConnectorsService, GetAvailableConnectorsService],
  exports: [GetEnabledConnectorsService, GetAvailableConnectorsService],
})
export class ConnectorsModule {}
