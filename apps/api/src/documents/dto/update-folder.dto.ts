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

export class UpdateFolderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  teamId?: string | null;

  @ApiProperty({ required: false, enum: PII_POLICIES })
  @IsOptional()
  @IsIn(PII_POLICIES)
  piiPolicy?: PiiPolicy;
}
