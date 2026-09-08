/* eslint-disable @typescript-eslint/unbound-method */
const decryptContent = jest.fn();
jest.mock('@ragenai/crypto', () => ({
  // Partial: only the function this file steers, not the whole envelope.
  ...jest.requireActual<typeof import('@ragenai/crypto')>('@ragenai/crypto'),
  decryptContent: (...args: unknown[]) => decryptContent(...args),
}));

import {
  wrapVectorStoreWithDualContentDecode,
  decodeDualContentChunks,
} from './dual-content-decode.js';
import { type VectorStoreClient } from '../../vector-store/types.js';

describe('decodeDualContentChunks', () => {
  const dek = Buffer.from('dek');
  const getOrCreatePiiDek = jest.fn().mockResolvedValue(dek);

  beforeEach(() => {
    decryptContent.mockReset();
    getOrCreatePiiDek.mockClear();
  });

  it('passes chunks through untouched when none use dual-content mode', async () => {
    const chunks = [{ pageContent: 'plain', metadata: {} }];

    const result = await decodeDualContentChunks(
      chunks,
      'org-1',
      getOrCreatePiiDek,
    );

    expect(result).toEqual(chunks);
    expect(getOrCreatePiiDek).not.toHaveBeenCalled();
  });

  it('decrypts dual-content chunks and leaves others as-is', async () => {
    decryptContent.mockReturnValue('real content');
    const chunks = [
      {
        pageContent: 'masked',
        metadata: { pii_mode: 'dual_content', content_original: 'cipher' },
      },
      { pageContent: 'unrelated', metadata: {} },
    ];

    const result = await decodeDualContentChunks(
      chunks,
      'org-1',
      getOrCreatePiiDek,
    );

    expect(result[0].pageContent).toBe('real content');
    expect(result[1].pageContent).toBe('unrelated');
    expect(getOrCreatePiiDek).toHaveBeenCalledWith('org-1');
    expect(decryptContent).toHaveBeenCalledWith('cipher', dek);
  });

  it('falls back to the masked content when decryption fails', async () => {
    decryptContent.mockImplementation(() => {
      throw new Error('bad ciphertext');
    });
    const chunks = [
      {
        pageContent: 'masked',
        metadata: { pii_mode: 'dual_content', content_original: 'cipher' },
      },
    ];

    const result = await decodeDualContentChunks(
      chunks,
      'org-1',
      getOrCreatePiiDek,
    );

    expect(result[0].pageContent).toBe('masked');
  });

  it('ignores content_original when pii_mode is not dual_content', async () => {
    const chunks = [
      {
        pageContent: 'masked',
        metadata: { pii_mode: 'other', content_original: 'cipher' },
      },
    ];

    const result = await decodeDualContentChunks(
      chunks,
      'org-1',
      getOrCreatePiiDek,
    );

    expect(result[0].pageContent).toBe('masked');
    expect(decryptContent).not.toHaveBeenCalled();
  });
});

describe('wrapVectorStoreWithDualContentDecode', () => {
  const dek = Buffer.from('dek');
  const getOrCreatePiiDek = jest.fn().mockResolvedValue(dek);

  beforeEach(() => {
    decryptContent.mockReset().mockReturnValue('real content');
    getOrCreatePiiDek.mockClear();
  });

  it('decodes similaritySearch results and passes addDocuments/deleteDocuments through', async () => {
    const similaritySearch = jest.fn().mockResolvedValue([
      {
        pageContent: 'masked',
        metadata: { pii_mode: 'dual_content', content_original: 'cipher' },
      },
    ]);
    const addDocuments = jest.fn().mockResolvedValue(undefined);
    const deleteDocuments = jest.fn().mockResolvedValue(undefined);
    const store: VectorStoreClient = {
      similaritySearch,
      addDocuments,
      deleteDocuments,
    };

    const wrapped = wrapVectorStoreWithDualContentDecode(
      store,
      'org-1',
      getOrCreatePiiDek,
    );
    const results = await wrapped.similaritySearch('q', 4);

    expect(results[0].pageContent).toBe('real content');
    expect(similaritySearch).toHaveBeenCalledWith('q', 4, undefined);

    await wrapped.addDocuments([]);
    expect(addDocuments).toHaveBeenCalled();

    await wrapped.deleteDocuments?.({});
    expect(deleteDocuments).toHaveBeenCalled();
  });

  it('omits deleteDocuments when the underlying store does not support it', () => {
    const store: VectorStoreClient = {
      similaritySearch: jest.fn(),
      addDocuments: jest.fn(),
    };

    const wrapped = wrapVectorStoreWithDualContentDecode(
      store,
      'org-1',
      getOrCreatePiiDek,
    );

    expect(wrapped.deleteDocuments).toBeUndefined();
  });
});
