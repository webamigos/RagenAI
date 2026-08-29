import { Module } from '@nestjs/common';
import { AssistantsController } from './assistants.controller.js';
import { AssistantsService } from './assistants.service.js';

@Module({
  controllers: [AssistantsController],
  providers: [AssistantsService],
})
export class AssistantsModule {}
