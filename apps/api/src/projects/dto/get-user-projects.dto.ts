import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetUserProjectsDto {
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  // See GetNotificationsDto.isRead for why this isn't `@Type(() => Boolean)`.
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === 'true',
  )
  @IsBoolean()
  includeArchived?: boolean;
}
