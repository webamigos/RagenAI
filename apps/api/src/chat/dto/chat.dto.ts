import {
  IsString,
  IsBoolean,
  IsIn,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export class ChatDto {
  @ApiProperty({
    description: 'The assistant (project) ID to query against.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  assistant_id!: string;

  @ApiProperty({
    description: 'The user message to send to the AI',
    minLength: 1,
    maxLength: 10000,
    example: 'What is our refund policy?',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({
    description:
      'Additional page or document context. Useful for embedded chatbots that pass the current page content.',
    maxLength: 20000,
    example: 'This is the FAQ page of our e-commerce store.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20000)
  context?: string;

  @ApiPropertyOptional({
    description:
      'Whether to stream the response as Server-Sent Events. Default: false.',
    default: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  stream?: boolean;

  @ApiPropertyOptional({
    description:
      'OpenAI-style reasoning effort. Forwarded to the underlying model — only honored by reasoning-capable models (e.g. GPT-OSS); silently ignored otherwise.',
    enum: ['low', 'medium', 'high'],
    example: 'medium',
  })
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  @IsOptional()
  reasoning_effort?: ReasoningEffort;
}
