import { Module } from '@nestjs/common';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { BrainController } from './brain.controller.js';
import { BrainService } from './brain.service.js';

@Module({
  imports: [SubscriptionsModule],
  controllers: [BrainController],
  providers: [BrainService],
})
export class BrainModule {}
