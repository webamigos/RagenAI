import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThreadsModule } from '../threads/threads.module';

@Module({
  imports: [EventEmitterModule.forRoot(), ThreadsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
