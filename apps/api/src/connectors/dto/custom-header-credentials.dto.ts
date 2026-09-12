import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomHeaderCredentialsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  siteUrl!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  consumerKey!: string;

  /**
   * Omitted entirely for `singleTokenAuth` providers (e.g. Open Mercato) —
   * `ConnectorsService` requires it only for two-part credentials
   * (WooCommerce's consumer key + secret).
   */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(1)
  consumerSecret?: string;
}
