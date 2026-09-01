import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';

@Module({
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
