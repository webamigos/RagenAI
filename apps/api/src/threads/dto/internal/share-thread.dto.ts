import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ShareThreadDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  recipientUserIds!: string[];
}
