import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SecurityModule } from '../security/security.module.js';
import { LoadMcpToolsService } from './load-mcp-tools.service.js';

@Module({
  imports: [ConnectorsModule, ProjectsModule, SecurityModule],
  providers: [LoadMcpToolsService],
  exports: [LoadMcpToolsService],
})
export class McpModule {}
