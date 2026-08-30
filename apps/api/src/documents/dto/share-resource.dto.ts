import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ShareResourceDto {
  @ApiProperty({ enum: ['user', 'team'] })
  @IsIn(['user', 'team'])
  granteeType!: 'user' | 'team';

  @ApiProperty()
  @IsString()
  granteeId!: string;

  @ApiProperty({ enum: ['view', 'full'] })
  @IsIn(['view', 'full'])
  permission!: 'view' | 'full';
}
