import { Controller, Get } from '@nestjs/common';

import { ThreadsService } from './threads.service';

@Controller('threads')
export class ThreadsController {
  constructor(private readonly threadService: ThreadsService) {}

  @Get()
  getData() {
    return this.threadService.getData();
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
