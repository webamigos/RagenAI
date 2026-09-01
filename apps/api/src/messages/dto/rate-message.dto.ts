import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RateMessageDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  feedback!: 'up' | 'down';
}
