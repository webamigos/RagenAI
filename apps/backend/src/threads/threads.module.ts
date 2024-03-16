import { Module } from '@nestjs/common';

import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { TestEventListener } from './listeners/test-event.listener';
import { RedisService } from '../service/redis.service';
import { RedisRepository } from '../infrastructure/redis/repository/redis.repository';

@Module({
  imports: [RedisService],
  controllers: [ThreadsController],
  providers: [ThreadsService, TestEventListener],
})
export class ThreadsModule {}
