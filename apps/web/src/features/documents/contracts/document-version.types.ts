import type { ChangeType } from '@/generated/prisma/client';
import type { RagScore } from './rag-score.types';

export type DocumentVersionSummary = {
  id: string;
  versionNumber: number;
  changeType: ChangeType;
  authorId: string | null;
  authorName: string | null;
  comment: string | null;
  ragScore: RagScore | null;
  isActive: boolean;
  createdAt: Date;
};

export type DocumentVersionDetail = DocumentVersionSummary & {
  content: string;
  title: string;
  metadata: Record<string, unknown> | null;
};
