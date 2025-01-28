import { PrismaClient, Thread, UserDocument } from '@prisma/client';

import db from '@ragenai/prisma-client';

import { ApiContext } from '../types/ApiContext';
import { replaceIds } from '../filters/replace-ids.filter';
import { UpdateThreadDto } from '../dtos/update-thread.dto';
import { NotFoundException } from './api-errors.service';

type ApiCollection<T extends { id: string | number | bigint }> = Omit<
  T,
  'public_id'
> & {
  id: T['id'];
};
type ApiUserDocument = ApiCollection<UserDocument>;
type ApiThread = ApiCollection<Thread>;

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

  async getDocuments(): Promise<ApiUserDocument[]> {
    const documents = await db.userDocument.findMany({
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

    return replaceIds(documents);
  }

  async getDocument(
    publicId: UserDocument['public_id']
  ): Promise<ApiUserDocument> {
    const document = await db.userDocument.findFirst({
      where: {
        organization_id: this.context.orgId,
        public_id: publicId,
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
    });

    return replaceIds(document);
  }

  // ======== THREADS ========
  async getUserThreads(): Promise<ApiThread[]> {
    const documents = await db.thread.findMany({
      where: {
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
      select: {
        public_id: true,
        title: true,
        source: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return replaceIds(documents);
  }

  async getUserThread(publicId: Thread['public_id']): Promise<ApiThread> {
    const document = await db.thread.findFirst({
      where: {
        public_id: publicId,
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
      select: {
        public_id: true,
        title: true,
        source: true,
        created_at: true,
      },
    });

    return replaceIds(document);
  }

  async updateUserThread(
    publicId: Thread['public_id'],
    payload: UpdateThreadDto
  ): Promise<ApiThread> {
    const record = this.getUserThread(publicId);

    if (!record) {
      throw new NotFoundException();
    }
    // TODO: what about public threads which doesn't have organization_id or user_id?
    const updatedThread = await this.db.thread.update({
      where: {
        public_id: publicId,
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
      data: {
        title: payload.title,
      },
      select: {
        public_id: true,
        title: true,
        source: true,
        created_at: true,
      },
    });

    return replaceIds(updatedThread);
  }

  async deleteUserThread(publicId: Thread['public_id']): Promise<void> {
    const record = this.getUserThread(publicId);

    if (!record) {
      throw new NotFoundException();
    }
    // TODO: what about public threads which doesn't have organization_id or user_id?

    await this.db.thread.delete({
      where: {
        public_id: publicId,
        organization_id: this.context.orgId,
        user_id: this.context.userId,
      },
    });
  }
}
