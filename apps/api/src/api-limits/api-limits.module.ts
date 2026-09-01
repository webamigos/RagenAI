import { Module } from '@nestjs/common';
import { ApiLimitsService } from './api-limits.service.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';

@Module({
  imports: [OrganizationsModule],
  providers: [ApiLimitsService],
  exports: [ApiLimitsService],
})
export class ApiLimitsModule {}
