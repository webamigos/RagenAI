import { FileType } from '../types/UserFile';

export type SplitterSettings = { chunkSize: number; chunkOverlap: number };

export const CHUNK_SETTINGS: Record<FileType, SplitterSettings> = {
  [FileType.MARKDOWN]: {
    chunkSize: 800,
    chunkOverlap: 200,
  },
  [FileType.TEXT]: {
    chunkSize: 800,
    chunkOverlap: 200,
  },
  [FileType.EPUB]: {
    chunkSize: 1500,
    chunkOverlap: 250,
  },
  [FileType.PDF]: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
  [FileType.SRT]: {
    chunkSize: 1500,
    chunkOverlap: 250,
  },
  [FileType.URL]: {
    chunkSize: 2500,
    chunkOverlap: 250,
  },
  [FileType.IMAGE]: {
    chunkSize: 2000,
    chunkOverlap: 200,
  },
  [FileType.CSV]: {
    chunkSize: 800,
    chunkOverlap: 200,
  },
  [FileType.XLSX]: {
    chunkSize: 800,
    chunkOverlap: 200,
  },
  [FileType.DOCX]: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
  [FileType.PPTX]: {
    chunkSize: 1000,
    chunkOverlap: 200,
  },
  [FileType.UNKNOWN]: {
    chunkSize: 0,
    chunkOverlap: 0,
  },
} as const;
