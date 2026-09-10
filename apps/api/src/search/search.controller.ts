import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { SearchService } from './search.service.js';
import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { SearchDto } from './dto/search.dto.js';

@ApiTags('Search')
@ApiSecurity('bearer')
@Controller('search')
@UseGuards(ApiKeyGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @ApiOperation({
    summary: 'Search the knowledge base',
    description:
      'Retrieve the most relevant knowledge base chunks for a query, without generating an answer. ' +
      'Returns the same LLM-ready, PII-redacted context block the chat endpoint feeds to its answer model, ' +
      'plus the ids of the source files it came from.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns `{ "context": "...", "file_ids": [...] }`.',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key is deactivated' })
  @ApiResponse({ status: 404, description: 'Assistant not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  search(@Body() dto: SearchDto, @GetApiContext() context: ApiContext) {
    return this.searchService.search(dto, context);
  }
}
