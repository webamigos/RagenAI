import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
