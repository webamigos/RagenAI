import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PiiPolicy } from '../../generated/prisma/client.js';

const PII_POLICIES = Object.values(PiiPolicy);

export class UpdateFolderPiiPolicyDto {
  @ApiProperty({ enum: PII_POLICIES })
  @IsIn(PII_POLICIES)
  piiPolicy!: PiiPolicy;
}
