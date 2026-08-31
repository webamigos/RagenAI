import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * OpenAI Assistants API `modify` body — every field optional. OpenAI
 * uses POST for modify (not PATCH); we accept both.
 */
export class UpdateAssistantDto {
  @ApiProperty({ required: false, minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, maxLength: 100_000 })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  instructions?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiProperty({ required: false, minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  // Accepted-but-ignored today. See CreateAssistantDto for rationale.
  @ApiProperty({ required: false })
  @IsOptional()
  tools?: unknown;

  @ApiProperty({ required: false })
  @IsOptional()
  tool_resources?: unknown;

  @ApiProperty({ required: false, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  top_p?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  response_format?: unknown;
}
