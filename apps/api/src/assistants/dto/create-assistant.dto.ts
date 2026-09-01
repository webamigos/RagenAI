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
 * OpenAI Assistants API request body for create + modify.
 *
 * For create: `name` is required (maps to our `Project.title`).
 * For modify: all fields optional.
 *
 * Fields we accept but don't currently persist (tolerated for SDK
 * compatibility, surfaced as defaults on read): `description`,
 * `tools`, `tool_resources`, `metadata`, `response_format`, `top_p`.
 * They may become real fields in future migrations.
 */
export class CreateAssistantDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

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

  // Accepted-but-ignored today (schema doesn't back them yet). Declared
  // so the global `forbidNonWhitelisted` pipe doesn't reject the
  // OpenAI SDK's default payload shape.
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
