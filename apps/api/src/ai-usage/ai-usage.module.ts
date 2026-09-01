import { Module } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service.js';

@Module({
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
