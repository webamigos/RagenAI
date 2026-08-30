import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateThreadContextDto {
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Project to mention as context, or null to clear it',
  })
  @IsOptional()
  @IsString()
  mentionedProjectId?: string | null;
}
