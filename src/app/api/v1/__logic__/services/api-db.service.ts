/**
 * @deprecated Prefer importing from queries/ and commands/ directly.
 * This class is kept as a thin wrapper for backward compatibility.
 */
import type {
  Thread,
  UserDocument,
  Message,
  Project,
} from '@/generated/prisma/client';

import { type ApiContext } from '../types/ApiContext';
import { type UpdateThreadDto } from '../dtos/update-thread.dto';
import { type ChatMessageDto } from '../dtos/chat.dto';
import { type QueryDto } from '../dtos/query.dto';
import { type UpdateProjectDto } from '../dtos/project.dto';

import {
  getApiDocumentsQuery,
  getApiDocumentQuery,
} from '../queries/api-documents.query';
import {
  getApiUserThreadsQuery,
  getApiUserThreadQuery,
  getApiChatMessagesQuery,
} from '../queries/api-threads.query';
import {
  getApiUserProjectQuery,
  getApiUserProjectsQuery,
} from '../queries/api-projects.query';
import {
  createApiUserThreadCommand,
  updateApiUserThreadCommand,
  deleteApiUserThreadCommand,
} from '../commands/api-threads.command';
import {
  createApiChatMessagesCommand,
  streamApiChatMessagesCommand,
} from '../commands/api-messages.command';
import {
  createApiUserProjectCommand,
  updateApiUserProjectCommand,
} from '../commands/api-projects.command';
import { apiRagQueryCommand } from '../commands/api-query.command';

type ApiCollection<T extends { id: string | number | bigint }> = Omit<
  T,
  'public_id'
> & {
  id: T['id'];
};
type ApiUserDocument = ApiCollection<UserDocument>;
type ApiThread = ApiCollection<Thread>;
type ApiMessage = ApiCollection<Message>;
type ApiProject = ApiCollection<Project>;

export class ApiDbService {
  private context: ApiContext;

  constructor(context: ApiContext) {
    if (!context.orgId) {
      throw new Error('Invalid organization');
    }
    this.context = context;
  }

  async getDocuments(): Promise<ApiUserDocument[]> {
    return getApiDocumentsQuery(this.context);
  }

  async getDocument(
    publicId: UserDocument['public_id'],
  ): Promise<ApiUserDocument> {
    return getApiDocumentQuery(this.context, publicId);
  }

  async getUserThreads(): Promise<ApiThread[]> {
    return getApiUserThreadsQuery(this.context);
  }

  async getUserThread(publicId: Thread['public_id']): Promise<ApiThread> {
    return getApiUserThreadQuery(this.context, publicId);
  }

  async updateUserThread(
    publicId: Thread['public_id'],
    payload: UpdateThreadDto,
  ): Promise<ApiThread> {
    return updateApiUserThreadCommand(this.context, publicId, payload);
  }

  async deleteUserThread(publicId: Thread['public_id']): Promise<void> {
    return deleteApiUserThreadCommand(this.context, publicId);
  }

  async createUserThread(): Promise<{ id: Thread['public_id'] }> {
    return createApiUserThreadCommand(this.context);
  }

  async getChatMessages(
    publicThreadId: Thread['public_id'],
  ): Promise<ApiMessage[]> {
    return getApiChatMessagesQuery(this.context, publicThreadId);
  }

  async createChatMessages(
    publicThreadId: Thread['public_id'],
    payload: ChatMessageDto,
  ) {
    return createApiChatMessagesCommand(this.context, publicThreadId, payload);
  }

  async streamChatMessages(
    publicThreadId: Thread['public_id'],
    payload: ChatMessageDto,
    controller: ReadableStreamDefaultController,
  ) {
    return streamApiChatMessagesCommand(
      this.context,
      publicThreadId,
      payload,
      controller,
    );
  }

  async query(payload: QueryDto) {
    return apiRagQueryCommand(this.context, payload);
  }

  async getUserProject(publicId: Project['public_id']): Promise<ApiProject> {
    return getApiUserProjectQuery(this.context, publicId);
  }

  async getUserProjects(): Promise<ApiProject[]> {
    return getApiUserProjectsQuery(this.context);
  }

  async createUserProject({ title }: { title: Project['title'] }): Promise<{
    id: Project['public_id'];
    title: Project['title'];
  }> {
    return createApiUserProjectCommand(this.context, { title });
  }

  async updateUserProject(
    publicId: Project['public_id'],
    payload: UpdateProjectDto,
  ): Promise<ApiProject> {
    return updateApiUserProjectCommand(this.context, publicId, payload);
  }
}
