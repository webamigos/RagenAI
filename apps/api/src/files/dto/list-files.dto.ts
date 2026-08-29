import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * OpenAI Files API query params for `GET /v1/files`. We accept the
 * standard OpenAI filters (`purpose`, pagination) plus our extension:
 * `limit` (OpenAI also uses this).
 */
export class ListFilesDto {
  /**
   * OpenAI's file purpose classification. We store everything as
   * "knowledge_base" (the Ragen equivalent), and accept `assistants`
   * as an alias since the OpenAI SDK defaults to it.
   */
  @ApiProperty({ required: false, enum: ['knowledge_base', 'assistants'] })
  @IsOptional()
  @IsString()
  @IsIn(['knowledge_base', 'assistants'])
  purpose?: 'knowledge_base' | 'assistants';

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    required: false,
    description: 'Return files created after this cursor (publicId)',
  })
  @IsOptional()
  @IsString()
  after?: string;
}
