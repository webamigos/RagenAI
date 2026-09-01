import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportFileToProjectDto {
  @ApiProperty()
  @IsString()
  targetProjectId!: string;
}
