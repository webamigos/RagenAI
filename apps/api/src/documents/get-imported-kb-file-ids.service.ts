import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Ported from apps/web's
 * src/features/documents/services/queries/get-imported-kb-file-ids-query.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Returns the source file IDs (UUIDs) for files imported from the global
 * knowledge base into a specific project. These IDs match
 * `metadata.file_id` in the vector store, so they can be used in an OR
 * filter to include KB file embeddings when searching within a project.
 */
@Injectable()
export class GetImportedKbFileIdsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: string, organizationId: string): Promise<string[]> {
    const imported = await this.prisma.client.userFile.findMany({
      where: {
        projectId,
        organizationId,
        sourceFileId: { not: null },
      },
      select: {
        sourceFileId: true,
      },
    });

    return imported
      .map((f) => f.sourceFileId)
      .filter((id): id is string => id !== null);
  }
}
