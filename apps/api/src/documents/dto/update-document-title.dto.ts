import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDocumentTitleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
