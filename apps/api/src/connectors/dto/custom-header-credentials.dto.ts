import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CustomHeaderCredentialsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  siteUrl!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  consumerKey!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  consumerSecret!: string;
}
