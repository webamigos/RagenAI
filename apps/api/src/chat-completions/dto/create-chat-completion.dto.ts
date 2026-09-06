import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
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
import { type ReasoningEffort } from '../../chat/dto/chat.dto.js';

export class ChatMessageDto {
  @ApiProperty({ enum: ['system', 'user', 'assistant'] })
  @IsString()
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(100_000)
  content!: string;

  /**
   * OpenAI's optional per-message author name. Accepted so the OpenAI
   * SDKs' message shape validates; `foldMessages` keys off `role`
   * alone, so the value doesn't reach the prompt.
   */
  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

/**
 * OpenAI-compatible `POST /v1/chat/completions` request body.
 *
 * Required fields: `messages` and `assistant_id`. `model` is optional
 * because ragen falls back to the org-default model when not set. All
 * other parameters are optional with sensible defaults.
 *
 * ## Why the long tail of unused fields
 *
 * The global pipe runs with `forbidNonWhitelisted`, so anything absent
 * from this class is a 400 — including plain OpenAI sampling params
 * like `top_p`. Callers pointing an OpenAI SDK at us shouldn't have to
 * strip their request first, so the standard params are declared here
 * and validated even where the RAG chain has nowhere to put them yet.
 * Same rationale as `CreateAssistantDto`.
 *
 * Deliberately *not* declared, so they keep failing loudly:
 * `tools` / `tool_choice` (RAG tool selection is server-side, via MCP),
 * and `response_format` (accepting JSON mode and then streaming prose
 * would break every caller that trusts it and calls `JSON.parse`).
 * A 400 naming the field beats a response that quietly ignores it.
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

  /**
   * OpenAI renamed `max_tokens` to `max_completion_tokens` for newer
   * models and the current SDKs send that name. Treated as an alias —
   * `max_tokens` wins when a caller sends both.
   */
  @ApiProperty({ required: false, minimum: 1, maximum: 32_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_000)
  max_completion_tokens?: number;

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

  /**
   * Honored, not merely tolerated: forwarded to the chain and onward to
   * LiteLLM. Reasoning-capable models (e.g. GPT-OSS) act on it; the
   * rest ignore it. Matches `POST /v1/chat`'s field of the same name.
   */
  @ApiProperty({ required: false, enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  reasoning_effort?: ReasoningEffort;

  // ── Accepted and validated, but without effect today ──────────────
  // Sampling and bookkeeping params that the RAG chain has no wiring
  // for. Ignoring these changes wording at most, never the response
  // shape, so tolerating them is safe in a way `response_format`
  // wouldn't be. See the class doc.

  @ApiProperty({ required: false, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  top_p?: number;

  /**
   * Only `1` is accepted. Returning a single choice for `n: 3` would
   * be a silent contract break, so anything higher is a 400.
   */
  @ApiProperty({ required: false, minimum: 1, maximum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1)
  n?: number;

  @ApiProperty({ required: false, oneOf: [{ type: 'string' }] })
  @IsOptional()
  stop?: string | string[];

  @ApiProperty({ required: false, minimum: -2, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  presence_penalty?: number;

  @ApiProperty({ required: false, minimum: -2, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  frequency_penalty?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  logit_bias?: Record<string, number>;

  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  seed?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  logprobs?: boolean;

  @ApiProperty({ required: false, minimum: 0, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  top_logprobs?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  store?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  parallel_tool_calls?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  service_tier?: string;
}
