import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SeedMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  content!: string;
}

export class CreateThreadDto {
  /**
   * Optional seed messages — matches OpenAI's Threads API shape, where
   * a thread can be created pre-populated with a conversation history.
   */
  @ApiProperty({ type: [SeedMessageDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SeedMessageDto)
  messages?: SeedMessageDto[];

  /**
   * Free-form metadata. OpenAI stores this as-is; we accept and echo it
   * back (not yet persisted — document-level schema change needed).
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  // Accepted-but-ignored for SDK payload tolerance.
  @ApiProperty({ required: false })
  @IsOptional()
  tool_resources?: unknown;

  // Ragen-specific extensions (optional — not part of OpenAI):
  @ApiProperty({
    required: false,
    description: 'Ragen extension — thread title',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({
    required: false,
    description:
      "Ragen extension — the assistant (project) this thread belongs to. The API key's scope decides, and this field has to agree with it: naming a different assistant, or naming one at all on a knowledge-base key, is a 403. Omitted, the key decides.",
  })
  @IsOptional()
  @IsString()
  assistant_id?: string;
}
