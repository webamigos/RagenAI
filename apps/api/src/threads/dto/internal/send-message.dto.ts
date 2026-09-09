import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Mirrors `messages/types.ts`'s `createMessageSchema` (zod) — the
 * service re-validates against that schema internally regardless, so
 * this DTO only needs to be permissive enough to pass whitelisting and
 * catch obviously-malformed input early.
 */
export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(10_000)
  prompt!: string;

  @ApiProperty({ required: false, enum: ['conversation', 'rag'] })
  @IsOptional()
  @IsIn(['conversation', 'rag'])
  mode?: 'conversation' | 'rag';

  @ApiProperty({ required: false, enum: ['TEXT', 'VOICE'] })
  @IsOptional()
  @IsIn(['TEXT', 'VOICE'])
  messageType?: 'TEXT' | 'VOICE';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  voiceDurationSeconds?: number;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  threadDocuments?: unknown[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  approvedToolCalls?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  deniedToolCalls?: string[];
}
