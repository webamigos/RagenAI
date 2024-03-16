import { Module } from '@nestjs/common';

import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { TestEventListener } from './listeners/test-event.listener';

@Module({
  imports: [],
  controllers: [ThreadsController],
  providers: [ThreadsService, TestEventListener],
})
export class ThreadsModule {}
