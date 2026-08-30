import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
