import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDocumentContentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  content?: string;
}
