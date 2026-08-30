import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller.js';
import { ThreadsService } from './threads.service.js';
import { MessagesService } from './messages.service.js';
import { PersistApiThreadService } from './persist-api-thread.service.js';

@Module({
  controllers: [ThreadsController],
  providers: [ThreadsService, MessagesService, PersistApiThreadService],
  exports: [PersistApiThreadService],
})
export class ThreadsModule {}
