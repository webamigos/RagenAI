import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveFolderDto {
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'New parent folder id, or omit/null to move to the root',
  })
  @IsOptional()
  @IsString()
  newParentId?: string | null;
}
