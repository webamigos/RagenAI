import type { KnowledgePageType } from './brain.types';
export type ReviewQueuePage = {
  publicId: string;
  title: string;
  type: KnowledgePageType;
  documents: { fileId: string; fileName: string | null }[];
};
