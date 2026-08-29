import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ minLength: 1, maxLength: 100_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  content!: string;

  // Accepted-but-ignored for SDK payload tolerance.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  attachments?: unknown;
}
