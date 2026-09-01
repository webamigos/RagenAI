import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleConnectorDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
