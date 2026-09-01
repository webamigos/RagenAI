import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchThreadsDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  query!: string;
}
