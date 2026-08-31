import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ enum: ['system', 'user', 'assistant'] })
  @IsString()
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(100_000)
  content!: string;
}

/**
 * OpenAI-compatible `POST /v1/chat/completions` request body.
 *
 * Required fields: `messages` and `assistant_id`. `model` is optional
 * because ragen falls back to the org-default model when not set. All
 * other parameters are optional with sensible defaults.
 */
export class CreateChatCompletionDto {
  @ApiProperty({
    description: 'The assistant (project) ID to query against.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  assistant_id!: string;

  @ApiProperty({ type: [ChatMessageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiProperty({ required: false, minimum: 0, maximum: 2 })
  @IsOptional()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 32_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_000)
  max_tokens?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  /**
   * OpenAI's stream_options. Only `include_usage` is meaningful for us;
   * when true, we emit a trailing chunk with usage (OpenAI style). When
   * omitted/false we skip the usage emission to match OpenAI defaults.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  stream_options?: {
    include_usage?: boolean;
  };
}
