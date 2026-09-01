import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateThreadDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  // Accepted-but-ignored.
  @ApiProperty({ required: false })
  @IsOptional()
  tool_resources?: unknown;

  // Ragen extension — rename the thread.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
