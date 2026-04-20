import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockBcryptCompare, mockDecryptMessageContents } = vi.hoisted(
  () => {
    const mockBcryptCompare = vi.fn();
    const mockDecryptMessageContents = vi
      .fn()
      .mockImplementation((msgs: unknown[]) => Promise.resolve(msgs));
    const mockDb = {
      threadPublicLink: {
        findUnique: vi.fn(),
      },
    };
    return { mockDb, mockBcryptCompare, mockDecryptMessageContents };
  },
);

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));
vi.mock('bcrypt', () => ({ default: { compare: mockBcryptCompare } }));
vi.mock('@/libs/crypto/decrypt-messages', () => ({
  decryptMessageContents: mockDecryptMessageContents,
}));

import { getPublicThreadQuery } from '../get-public-thread-query';

const mockThread = {
  id: 'thread-1',
  title: 'My Thread',
  encryptedDek: null,
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
  ],
};

const mockLink = {
  publicId: 'pub-id',
  expiresAt: null,
  passwordHash: null,
  createdBy: { name: 'Alice' },
  thread: mockThread,
};

describe('getPublicThreadQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns not_found when link does not exist', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(null);

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      submittedPassword: null,
    });

    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns not_found when link is expired', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      expiresAt: new Date('2020-01-01'),
    });

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      submittedPassword: null,
    });

    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns password_required when link has password and no password submitted', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      submittedPassword: null,
    });

    expect(result).toEqual({ status: 'password_required' });
  });

  it('returns password_invalid when wrong password submitted', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });
    mockBcryptCompare.mockResolvedValue(false);

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      submittedPassword: 'wrong',
    });

    expect(result).toEqual({ status: 'password_invalid' });
  });

  it('returns ok with messages for valid link without password', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue(mockLink);
    mockDecryptMessageContents.mockImplementation((msgs: unknown[]) =>
      Promise.resolve(msgs),
    );

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      submittedPassword: null,
    });

    expect(result).toEqual({
      status: 'ok',
      title: 'My Thread',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ],
      createdByName: 'Alice',
    });
  });

  it('returns ok for valid link with correct password', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });
    mockBcryptCompare.mockResolvedValue(true);

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      submittedPassword: 'correct',
    });

    expect(result.status).toBe('ok');
  });
});
