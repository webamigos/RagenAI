import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}
