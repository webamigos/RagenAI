import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PiiPolicy } from '../../generated/prisma/client.js';

const PII_POLICIES = Object.values(PiiPolicy);

export class CreateFolderDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parentId?: string;

  /**
   * Explicitly decided by apps/web before this call: org admins create
   * org-wide folders (ownerId: null), everyone else creates a personal
   * folder (ownerId: their own userId) — see
   * docs/adrs/21-monorepo-and-api-decoupling.md, documents UI cutover.
   * Falls back to the caller's own userId when omitted.
   */
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  ownerId?: string | null;

  @ApiProperty({ required: false, enum: PII_POLICIES })
  @IsOptional()
  @IsIn(PII_POLICIES)
  piiPolicy?: PiiPolicy;
}
