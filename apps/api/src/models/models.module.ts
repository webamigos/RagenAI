import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller.js';
import { ModelsService } from './models.service.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';

@Module({
  imports: [OrganizationsModule],
  controllers: [ModelsController],
  providers: [ModelsService],
})
export class ModelsModule {}
