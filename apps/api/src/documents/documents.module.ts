import { Module } from '@nestjs/common';
import { GetImportedKbFileIdsService } from './get-imported-kb-file-ids.service.js';

@Module({
  providers: [GetImportedKbFileIdsService],
  exports: [GetImportedKbFileIdsService],
})
export class DocumentsModule {}
