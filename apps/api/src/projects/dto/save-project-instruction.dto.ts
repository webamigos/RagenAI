import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveProjectInstructionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(10_000)
  instruction!: string;
}
