import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockDb,
  mockBcryptCompare,
  mockDecryptMessageContents,
  mockIsFeatureEnabled,
} = vi.hoisted(() => {
  const mockBcryptCompare = vi.fn();
  const mockIsFeatureEnabled = vi.fn();
  const mockDecryptMessageContents = vi
    .fn()
    .mockImplementation((msgs: unknown[]) => Promise.resolve(msgs));
  const mockDb = {
    threadPublicLink: {
      findUnique: vi.fn(),
    },
  };
  return {
    mockDb,
    mockBcryptCompare,
    mockDecryptMessageContents,
    mockIsFeatureEnabled,
  };
});

vi.mock('@ragenai/prisma-client', () => ({ default: mockDb }));
vi.mock('bcrypt', () => ({ default: { compare: mockBcryptCompare } }));
vi.mock('@/libs/crypto/decrypt-messages', () => ({
  decryptMessageContents: mockDecryptMessageContents,
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: mockIsFeatureEnabled }),
);

import { getPublicThreadQuery } from '../get-public-thread-query';

const mockThread = {
  id: 'thread-1',
  title: 'My Thread',
  encryptedDek: null,
  organizationId: 'org-1',
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
  beforeEach(() => {
    vi.clearAllMocks();
    // Enabled by default so the cases below exercise link semantics, not the flag.
    mockIsFeatureEnabled.mockResolvedValue(true);
  });

  it('returns not_found when the thread has no organization to resolve the flag against', async () => {
    // Thread.organizationId is nullable. With no org there are no settings to
    // read the flag from, so the link cannot be shown to be permitted.
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      thread: { ...mockThread, organizationId: null },
    });

    const result = await getPublicThreadQuery({ publicId: 'pub-id' });

    expect(result).toEqual({ status: 'not_found' });
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
    expect(mockDecryptMessageContents).not.toHaveBeenCalled();
  });

  it('returns not_found for a live link once publicThreadLinks is disabled', async () => {
    // Turning the feature off must close links already in circulation, and
    // must not distinguish "disabled" from "missing" — that would confirm to
    // an anonymous URL holder that the thread exists.
    mockDb.threadPublicLink.findUnique.mockResolvedValue(mockLink);
    mockIsFeatureEnabled.mockResolvedValue(false);

    const result = await getPublicThreadQuery({ publicId: 'pub-id' });

    expect(result).toEqual({ status: 'not_found' });
    // The org comes from the thread, not a session — the caller is anonymous.
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith(
      'org-1',
      'publicThreadLinks',
    );
    expect(mockDecryptMessageContents).not.toHaveBeenCalled();
  });

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

  it('returns ok when cookieVerified is true (skips bcrypt)', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      cookieVerified: true,
    });

    expect(result.status).toBe('ok');
    expect(mockBcryptCompare).not.toHaveBeenCalled();
  });

  it('returns password_required when cookieVerified is false and no password', async () => {
    mockDb.threadPublicLink.findUnique.mockResolvedValue({
      ...mockLink,
      passwordHash: 'hash',
    });

    const result = await getPublicThreadQuery({
      publicId: 'pub-id',
      cookieVerified: false,
    });

    expect(result).toEqual({ status: 'password_required' });
  });
});
