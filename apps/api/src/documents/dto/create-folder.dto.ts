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

  @ApiProperty({ required: false, enum: PII_POLICIES })
  @IsOptional()
  @IsIn(PII_POLICIES)
  piiPolicy?: PiiPolicy;
}
