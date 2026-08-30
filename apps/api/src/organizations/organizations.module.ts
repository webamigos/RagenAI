import { Module } from '@nestjs/common';
import { OrganizationSettingsService } from './organization-settings.service.js';
import { GetOrganizationMetadataService } from './get-organization-metadata.service.js';

@Module({
  providers: [OrganizationSettingsService, GetOrganizationMetadataService],
  exports: [OrganizationSettingsService, GetOrganizationMetadataService],
})
export class OrganizationsModule {}
