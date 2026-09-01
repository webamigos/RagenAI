import { Module } from '@nestjs/common';
import { TemporalClientService } from './temporal-client.service.js';

@Module({
  providers: [TemporalClientService],
  exports: [TemporalClientService],
})
export class TemporalModule {}
