import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchDto {
  @ApiProperty({
    description: 'The assistant (project) ID to search against.',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  assistant_id!: string;

  @ApiProperty({
    description: 'The search query.',
    minLength: 1,
    maxLength: 2000,
    example: 'What is our refund policy?',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query!: string;

  @ApiPropertyOptional({
    description:
      "Maximum number of chunks to return. Default: the organization's configured retrieval count.",
    minimum: 1,
    maximum: 20,
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  max_results?: number;
}
