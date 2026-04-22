import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSetEx = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
const mockDel = vi.hoisted(() => vi.fn());
const mockGetRedisInstance = vi.hoisted(() =>
  vi.fn(() => ({
    setEx: mockSetEx,
    get: mockGet,
    del: mockDel,
  })),
);

vi.mock('@/app/lib/services/redis', () => ({
  getRedisInstance: mockGetRedisInstance,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRedisInstance.mockImplementation(() => ({
    setEx: mockSetEx,
    get: mockGet,
    del: mockDel,
  }));
});

describe('piiSessionStore.save', () => {
  it('zapisuje mapę aliasów jako JSON z TTL gdy aliasMap niepusta', async () => {
    const { piiSessionStore } = await import('../pii-session-store');
    mockSetEx.mockResolvedValueOnce('OK');

    await piiSessionStore.save(
      'thread-123',
      { '<PL_NIP_1>': '1234567890' },
      3600,
    );

    expect(mockSetEx).toHaveBeenCalledWith(
      'pii:thread-123',
      JSON.stringify({ '<PL_NIP_1>': '1234567890' }),
      3600,
    );
  });

  it('nie zapisuje do Redis gdy aliasMap jest pusta', async () => {
    const { piiSessionStore } = await import('../pii-session-store');

    await piiSessionStore.save('thread-123', {}, 3600);

    expect(mockSetEx).not.toHaveBeenCalled();
  });

  it('rzuca błąd gdy Redis niedostępny i aliasMap niepusta', async () => {
    mockGetRedisInstance.mockReturnValueOnce(
      null as unknown as ReturnType<typeof mockGetRedisInstance>,
    );
    const { piiSessionStore } = await import('../pii-session-store');

    await expect(
      piiSessionStore.save('thread-123', { '<PL_NIP_1>': '1234567890' }, 3600),
    ).rejects.toThrow('Redis unavailable');
  });
});

describe('piiSessionStore.get', () => {
  it('zwraca mapę aliasów gdy klucz istnieje', async () => {
    const { piiSessionStore } = await import('../pii-session-store');
    mockGet.mockResolvedValueOnce(
      JSON.stringify({ '<PL_NIP_1>': '1234567890' }),
    );

    const result = await piiSessionStore.get('thread-123');

    expect(result).toEqual({ '<PL_NIP_1>': '1234567890' });
    expect(mockGet).toHaveBeenCalledWith('pii:thread-123');
  });

  it('zwraca pustą mapę gdy klucz nie istnieje', async () => {
    const { piiSessionStore } = await import('../pii-session-store');
    mockGet.mockResolvedValueOnce(null);

    const result = await piiSessionStore.get('thread-123');

    expect(result).toEqual({});
  });
});

describe('piiSessionStore.del', () => {
  it('usuwa klucz z Redis', async () => {
    const { piiSessionStore } = await import('../pii-session-store');
    mockDel.mockResolvedValueOnce(1);

    await piiSessionStore.del('thread-123');

    expect(mockDel).toHaveBeenCalledWith('pii:thread-123');
  });
});
