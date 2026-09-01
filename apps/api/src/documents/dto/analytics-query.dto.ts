import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsQueryDto {
  @ApiProperty({ required: false, minimum: 1, maximum: 365, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
