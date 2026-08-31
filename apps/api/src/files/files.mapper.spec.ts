import { toOpenAIFile } from './files.mapper.js';

describe('toOpenAIFile', () => {
  function base() {
    return {
      id: 'abc',
      fileName: 'doc.pdf',
      fileSize: 1234,
      createdAt: new Date('2026-04-14T12:00:00Z'),
      parsingStatus: 'NOT_STARTED',
      embeddingStatus: 'NOT_STARTED',
    };
  }

  it('prefixes id with "file-" and emits OpenAI shape', () => {
    const out = toOpenAIFile(base());
    expect(out).toEqual({
      id: 'file-abc',
      object: 'file',
      bytes: 1234,
      created_at: Math.floor(new Date('2026-04-14T12:00:00Z').getTime() / 1000),
      filename: 'doc.pdf',
      purpose: 'knowledge_base',
      status: 'uploaded',
      status_details: null,
    });
  });

  it('maps both-COMPLETED → processed', () => {
    const out = toOpenAIFile({
      ...base(),
      parsingStatus: 'COMPLETED',
      embeddingStatus: 'COMPLETED',
    });
    expect(out.status).toBe('processed');
  });

  it('maps FAILED parsing → error', () => {
    const out = toOpenAIFile({
      ...base(),
      parsingStatus: 'FAILED',
      embeddingStatus: 'NOT_STARTED',
    });
    expect(out.status).toBe('error');
  });

  it('maps FAILED embedding → error', () => {
    const out = toOpenAIFile({
      ...base(),
      parsingStatus: 'COMPLETED',
      embeddingStatus: 'FAILED',
    });
    expect(out.status).toBe('error');
  });

  it('maps STARTED/pending → uploaded', () => {
    const out = toOpenAIFile({
      ...base(),
      parsingStatus: 'STARTED',
      embeddingStatus: 'NOT_STARTED',
    });
    expect(out.status).toBe('uploaded');
  });

  it('defaults created_at to 0 when createdAt is null', () => {
    const out = toOpenAIFile({ ...base(), createdAt: null });
    expect(out.created_at).toBe(0);
  });
});
