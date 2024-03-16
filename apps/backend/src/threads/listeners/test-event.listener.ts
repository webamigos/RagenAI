import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TestEvent } from '../events/test-event';

@Injectable()
export class TestEventListener {
  @OnEvent('test.event')
  handleOrderCreatedEvent(event: TestEvent) {
    // handle and process "OrderCreatedEvent" event
    console.log('Received event: ', event);
  }
}
