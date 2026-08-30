import { Module } from '@nestjs/common';
import { GetProjectMcpProvidersService } from './get-project-mcp-providers.service.js';

@Module({
  providers: [GetProjectMcpProvidersService],
  exports: [GetProjectMcpProvidersService],
})
export class ProjectsModule {}
