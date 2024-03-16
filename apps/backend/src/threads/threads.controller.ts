import { Controller, Get, Sse, type MessageEvent } from '@nestjs/common';

import { ThreadsService } from './threads.service';
import { Observable, fromEvent, interval, map } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';

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

  @Sse('sse')
  sse(): Observable<MessageEvent> {
    // return interval(1000).pipe(
    //   map((_) => ({ data: { hello: 'world' } } as MessageEvent))
    // );

    return fromEvent(this.eventEmitter, 'test.event').pipe(
      map((_data) => {
        //
        return new MessageEvent('order_created', { data: 'lorem ipsum' });
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
