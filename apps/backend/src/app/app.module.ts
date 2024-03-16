import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThreadsModule } from '../threads/threads.module';
import { RedisModule } from '../infrastructure/redis/redis.module';

@Module({
  imports: [EventEmitterModule.forRoot(), RedisModule, ThreadsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
