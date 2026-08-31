import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleChatbotDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
