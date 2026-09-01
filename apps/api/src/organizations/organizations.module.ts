import { Module } from '@nestjs/common';
import { OrganizationSettingsService } from './organization-settings.service.js';
import { GetOrganizationMetadataService } from './get-organization-metadata.service.js';
import { StorageUsageService } from './storage-usage.service.js';

@Module({
  providers: [
    OrganizationSettingsService,
    GetOrganizationMetadataService,
    StorageUsageService,
  ],
  exports: [
    OrganizationSettingsService,
    GetOrganizationMetadataService,
    StorageUsageService,
  ],
})
export class OrganizationsModule {}
