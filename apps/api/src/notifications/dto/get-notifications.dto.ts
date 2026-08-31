import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../../generated/prisma/client.js';

const NOTIFICATION_TYPES = Object.values(NotificationType);

export class GetNotificationsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  // Query strings arrive as "true"/"false" — `@Type(() => Boolean)` would
  // coerce via the `Boolean(...)` constructor, where `Boolean('false')` is
  // `true`. Transform explicitly instead; pass an absent param through as
  // `undefined` (no filter) rather than coercing it to `false`.
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === 'true',
  )
  @IsBoolean()
  isRead?: boolean;

  @ApiProperty({ required: false, enum: NOTIFICATION_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(NOTIFICATION_TYPES)
  type?: NotificationType;

  @ApiProperty({
    required: false,
    description:
      'Return notifications created before this cursor (publicId of the last item on the previous page)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
