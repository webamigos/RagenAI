import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { FileType, EmbeddingStatus } from '../../generated/prisma/client.js';

const FILE_TYPES = Object.values(FileType);
const EMBEDDING_STATUSES = Object.values(EmbeddingStatus);
const SORT_FIELDS = ['fileName', 'createdAt', 'fileSize', 'fileType'] as const;
const VIEW_MODES = ['all', 'my-files', 'shared-with-me'] as const;

function toArray(value: unknown): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

export class GetUserFilesDto {
  @ApiProperty({
    required: false,
    description:
      'Filter by folder id. Pass the literal string "null" to list only root-level files (no folder).',
  })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiProperty({ required: false, enum: VIEW_MODES, default: 'all' })
  @IsOptional()
  @IsIn(VIEW_MODES)
  viewMode?: (typeof VIEW_MODES)[number];

  @ApiProperty({ required: false, enum: SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sort?: (typeof SORT_FIELDS)[number];

  @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @ApiProperty({ required: false, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiProperty({ required: false, enum: FILE_TYPES, isArray: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @IsArray()
  @IsIn(FILE_TYPES, { each: true })
  fileType?: FileType[];

  @ApiProperty({ required: false, enum: EMBEDDING_STATUSES, isArray: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(EMBEDDING_STATUSES, { each: true })
  embeddingStatus?: EmbeddingStatus[];
}
