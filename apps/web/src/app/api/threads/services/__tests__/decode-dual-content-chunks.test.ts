import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptContent } from '@/libs/crypto/thread-encryption';

const { mockGetOrCreatePiiDek } = vi.hoisted(() => ({
  mockGetOrCreatePiiDek: vi.fn(),
}));

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getOrCreatePiiDek: mockGetOrCreatePiiDek,
}));

vi.mock('@/libs/crypto/thread-encryption', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/libs/crypto/thread-encryption')>();
  return actual;
});

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { decodeDualContentChunks } from '../decode-dual-content-chunks';

describe('decodeDualContentChunks', () => {
  const testDek = randomBytes(32);
  const originalText = 'Jan Kowalski PESEL 80010112345 telefon +48123456789';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreatePiiDek.mockResolvedValue(testDek);
  });

  it('leaves destructive chunks unchanged', async () => {
    const chunks = [
      {
        pageContent: 'Jan <PERSON> telefon <PHONE_NUMBER>',
        metadata: { pii_mode: 'destructive' },
      },
    ];
    const result = await decodeDualContentChunks(chunks, 'org-1');
    expect(result[0].pageContent).toBe('Jan <PERSON> telefon <PHONE_NUMBER>');
    expect(mockGetOrCreatePiiDek).not.toHaveBeenCalled();
  });

  it('leaves old chunks without pii_mode unchanged', async () => {
    const chunks = [{ pageContent: 'some text', metadata: {} }];
    const result = await decodeDualContentChunks(chunks, 'org-1');
    expect(result[0].pageContent).toBe('some text');
    expect(mockGetOrCreatePiiDek).not.toHaveBeenCalled();
  });

  it('decrypts content_original for dual_content chunks', async () => {
    const encryptedOriginal = encryptContent(originalText, testDek);
    const chunks = [
      {
        pageContent: 'Jan <PERSON> PESEL <ID> telefon <PHONE_NUMBER>',
        metadata: {
          pii_mode: 'dual_content',
          content_original: encryptedOriginal,
        },
      },
    ];
    const result = await decodeDualContentChunks(chunks, 'org-1');
    expect(result[0].pageContent).toBe(originalText);
    expect(mockGetOrCreatePiiDek).toHaveBeenCalledWith('org-1');
  });

  it('falls back to masked content when content_original is absent', async () => {
    const chunks = [
      { pageContent: 'masked content', metadata: { pii_mode: 'dual_content' } },
    ];
    const result = await decodeDualContentChunks(chunks, 'org-1');
    expect(result[0].pageContent).toBe('masked content');
    expect(mockGetOrCreatePiiDek).not.toHaveBeenCalled();
  });

  it('calls getOrCreatePiiDek once for multiple dual_content chunks', async () => {
    const enc1 = encryptContent('oryginał 1', testDek);
    const enc2 = encryptContent('oryginał 2', testDek);
    const chunks = [
      {
        pageContent: 'masked 1',
        metadata: { pii_mode: 'dual_content', content_original: enc1 },
      },
      {
        pageContent: 'masked 2',
        metadata: { pii_mode: 'dual_content', content_original: enc2 },
      },
    ];
    const result = await decodeDualContentChunks(chunks, 'org-1');
    expect(result[0].pageContent).toBe('oryginał 1');
    expect(result[1].pageContent).toBe('oryginał 2');
    expect(mockGetOrCreatePiiDek).toHaveBeenCalledTimes(1);
  });
});
