import { PrismaClient } from '@prisma/client';
import db from '@ragenai/prisma-client';

import { ApiContext } from '../types/ApiContext';

export class ApiDbService {
  private db: PrismaClient;
  private context: ApiContext;

  constructor(context: ApiContext) {
    this.db = db;
    if (!context.orgId) {
      throw new Error('Invalid organization');
    }
    this.context = context;
  }

  async fetchDocuments() {
    return await db.userDocument.findMany({
      where: {
        organization_id: this.context.orgId,
      },
      select: {
        public_id: true, // make an alias and return as id?
        title: true,
        // content: true, it may be large field
        created_at: true,
        updated_at: true,
        file: {
          // is this needed?
          select: {
            public_id: true, // make an alias and return as id?
            file_name: true,
            file_size: true,
            created_at: true,
            file_type: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }
}
