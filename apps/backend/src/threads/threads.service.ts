import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TestEvent } from './events/test-event';
import Redis from 'ioredis';
import { RedisService } from '../service/redis.service';

@Injectable()
export class ThreadsService implements OnModuleInit {
  private readonly logger = new Logger(ThreadsService.name);

  constructor(
    private eventEmitter: EventEmitter2,
    private readonly redisService: RedisService
  ) {}

  onModuleInit() {
    const redisChannel = 'salesyy-events';
    this.redisService.getClient().subscribe(redisChannel, (err, count) => {
      if (err) {
        // Just like other commands, subscribe() can fail for some reasons,
        // ex network issues.
        this.logger.log('Failed to subscribe: %s', err.message);
      } else {
        // `count` represents the number of channels this client are currently subscribed to.
        this.logger.log(
          `Subscribed successfully! This client is currently subscribed to ${count} channels.`
        );
      }
    });

    throw new Error('Method not implemented.');
  }

  getData(): { message: string } {
    this.logger.log('Sending event "test.event"...');
    const testEvent = new TestEvent();
    testEvent.name = 'This is test event';
    testEvent.description = 'This is test description';
    this.eventEmitter.emit('test.event', testEvent);
    return { message: 'Hello API' };
  }

  emitEvent() {
    this.eventEmitter.emit('test.event', { sampleData: 'hej' });
  }
}
