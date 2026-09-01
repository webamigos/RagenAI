import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePublicLinkDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;
}
