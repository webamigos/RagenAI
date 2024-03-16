import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TestEvent } from './events/test-event';

@Injectable()
export class ThreadsService {
  private readonly logger = new Logger(ThreadsService.name);

  constructor(private eventEmitter: EventEmitter2) {}

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
