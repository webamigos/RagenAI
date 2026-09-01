import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveFileDto {
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Target folder id, or omit/null to remove from any folder',
  })
  @IsOptional()
  @IsString()
  folderId?: string | null;
}
