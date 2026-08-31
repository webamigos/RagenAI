import { Module } from '@nestjs/common';
import { S3StorageService } from './s3-storage.service.js';

@Module({
  providers: [S3StorageService],
  exports: [S3StorageService],
})
export class StorageModule {}
