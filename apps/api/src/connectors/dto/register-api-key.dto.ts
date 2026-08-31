import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterApiKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  apiKey!: string;
}
