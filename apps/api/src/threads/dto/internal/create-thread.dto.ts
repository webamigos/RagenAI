import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  KNOWLEDGE_SCOPES,
  type KnowledgeScope,
} from '@ragenai/platform-contracts';

export class CreateThreadRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mentionedProjectId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  preferredModel?: string;

  /**
   * How much this thread may retrieve, fixed for its life. Omitted means
   * `KNOWLEDGE_BASE`, which is what the column defaults to — see gap 10 in
   * docs/specs/2026-09-09-design-system-v2-functional-gaps.md.
   */
  @ApiProperty({ required: false, enum: KNOWLEDGE_SCOPES })
  @IsOptional()
  @IsIn(KNOWLEDGE_SCOPES)
  knowledgeScope?: KnowledgeScope;

  /**
   * Not deep-validated here — `ThreadsCoreService.createThread` only
   * reads `.userFileId` off each item and silently drops anything else,
   * so a permissive array is enough; whitelisting still blocks unknown
   * top-level DTO fields.
   */
  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  threadDocuments?: unknown[];
}
