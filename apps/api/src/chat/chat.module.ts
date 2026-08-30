import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { RagEngineModule } from '../rag-engine/rag-engine.module.js';
import { ThreadsModule } from '../threads/threads.module.js';

@Module({
  imports: [RagEngineModule, ThreadsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
