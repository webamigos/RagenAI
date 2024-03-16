import { Controller, Get, Sse, type MessageEvent, Param } from '@nestjs/common';

import { ThreadsService } from './threads.service';
import { Observable, fromEvent, map } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TestEvent } from './events/test-event';

@Controller('threads')
export class ThreadsController {
  constructor(
    private readonly threadService: ThreadsService,
    private eventEmitter: EventEmitter2
  ) {}

  @Get()
  getData() {
    return this.threadService.getData();
  }

  @Sse(':id/sse')
  sse(@Param('id') id: string): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'test.event').pipe(
      map((eventData: TestEvent) => {
        return new MessageEvent('order_created', { data: eventData });
      })
    );
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.detailsService.findOne(id);
  // }

  // @Post()
  // create(@Body() createMovieDto: CreateMovieDto) {
  //   console.log('data: ', createMovieDto);
  // }
}
