import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiConsumes,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { FilesService } from './files.service.js';
import { ListFilesDto } from './dto/list-files.dto.js';
import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';
import { OpenAiExceptionFilter } from '../common/filters/openai-exception.filter.js';

/**
 * OpenAI-compatible Files API. Mirrors the shape the OpenAI Python/JS
 * SDKs speak against `/v1/files` so `client.files.list()` /
 * `client.files.create()` / `client.files.retrieve()` /
 * `client.files.delete()` all work against ragen-api without changes.
 */
@ApiTags('Files')
@ApiSecurity('bearer')
@Controller('files')
@UseGuards(ApiKeyGuard)
@UseFilters(OpenAiExceptionFilter)
@SkipResponseTransform()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @ApiOperation({
    summary: 'List files',
    description:
      'Returns files in the caller project in OpenAI envelope format.',
  })
  list(@GetApiContext() context: ApiContext, @Query() query: ListFilesDto) {
    return this.filesService.list(context, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a file' })
  retrieve(@Param('id') id: string, @GetApiContext() context: ApiContext) {
    return this.filesService.get(id, context);
  }

  // Uploads trigger S3 put + Temporal workflow — gate behind the
  // `expensive` tier so accidental loops can't flood the worker.
  @Post()
  @Throttle({ expensive: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a file',
    description:
      'Upload a file and start the ingest pipeline (parse → embed → index). ' +
      'Returns immediately with status `uploaded`; poll `GET /v1/files/:id` ' +
      'for status transitions.',
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @GetApiContext() context: ApiContext,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const purpose = (req.body as { purpose?: string } | undefined)?.purpose;
    await this.filesService.upload(file, purpose, context, req, res);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file' })
  remove(@Param('id') id: string, @GetApiContext() context: ApiContext) {
    return this.filesService.remove(id, context);
  }
}
