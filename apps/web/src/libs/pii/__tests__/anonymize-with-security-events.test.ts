import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const anonymize = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock('../presidio-client', () => ({
  presidioClient: { anonymize },
}));

vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({ recordSecurityEvent }),
);

import {
  anonymizeWithSecurityEvents,
  isPiiMaskingEnabled,
} from '../anonymize-with-security-events';

const ctx = {
  orgId: 'org_1',
  userId: 'user_1',
  threadId: 'thread_1',
};

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  // The rest of this file tests the "masking is turned on" behavior — the
  // feature defaults to off, so opt in explicitly. Disabled-by-default
  // behavior has its own describe block below.
  process.env.FEATURE_FLAG_PII_MASKING = '1';
});

afterEach(() => {
  process.env = originalEnv;
});

describe('isPiiMaskingEnabled', () => {
  it('defaults to disabled when the flag is unset', () => {
    delete process.env.FEATURE_FLAG_PII_MASKING;
    expect(isPiiMaskingEnabled()).toBe(false);
  });

  it('is disabled for any value other than "1"', () => {
    process.env.FEATURE_FLAG_PII_MASKING = 'true';
    expect(isPiiMaskingEnabled()).toBe(false);
  });

  it('is enabled when set to "1"', () => {
    process.env.FEATURE_FLAG_PII_MASKING = '1';
    expect(isPiiMaskingEnabled()).toBe(true);
  });
});

describe('anonymizeWithSecurityEvents when disabled (the default)', () => {
  it('returns the original text unmasked without calling Presidio or recording any event', async () => {
    delete process.env.FEATURE_FLAG_PII_MASKING;

    const result = await anonymizeWithSecurityEvents('Jan Kowalski', 'pl', ctx);

    expect(anonymize).not.toHaveBeenCalled();
    expect(recordSecurityEvent).not.toHaveBeenCalled();
    expect(result.piiResult.maskedText).toBe('Jan Kowalski');
    expect(result.piiResult.aliasMap).toEqual({});
    expect(result.entityTypes).toEqual([]);
    expect(result.durationMs).toBe(0);
  });
});

describe('anonymizeWithSecurityEvents', () => {
  it('records CHAT_PII_MASKING_FAILED and rethrows when analyzer fails', async () => {
    const err = new Error('Presidio analyzer unavailable: timeout');
    anonymize.mockRejectedValueOnce(err);

    await expect(
      anonymizeWithSecurityEvents('Jan Kowalski', 'pl', ctx),
    ).rejects.toThrow('Presidio analyzer unavailable: timeout');

    expect(recordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(recordSecurityEvent).toHaveBeenCalledWith({
      eventType: 'CHAT_PII_MASKING_FAILED',
      severity: 'warn',
      source: 'chat',
      organizationId: 'org_1',
      userId: 'user_1',
      metadata: {
        threadId: 'thread_1',
        error: 'Presidio analyzer unavailable: timeout',
      },
    });
  });

  it('serializes non-Error throws into the metadata.error field', async () => {
    anonymize.mockRejectedValueOnce('boom');

    await expect(anonymizeWithSecurityEvents('text', 'pl', ctx)).rejects.toBe(
      'boom',
    );

    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'CHAT_PII_MASKING_FAILED',
        metadata: expect.objectContaining({ error: 'boom' }),
      }),
    );
  });

  it('does not record an event when no PII is detected', async () => {
    anonymize.mockResolvedValueOnce({
      maskedText: 'plain text',
      aliasMap: {},
    });

    const result = await anonymizeWithSecurityEvents('plain text', 'pl', ctx);

    expect(recordSecurityEvent).not.toHaveBeenCalled();
    expect(result.entityTypes).toEqual([]);
    expect(result.piiResult.aliasMap).toEqual({});
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records CHAT_PII_DETECTED with aliasCount, entityTypes and entityCounts', async () => {
    anonymize.mockResolvedValueOnce({
      maskedText: '<EMAIL_ADDRESS_1> i <EMAIL_ADDRESS_2> i PESEL <PL_PESEL_1>',
      aliasMap: {
        '<EMAIL_ADDRESS_1>': 'a@b.pl',
        '<EMAIL_ADDRESS_2>': 'c@d.pl',
        '<PL_PESEL_1>': '44051401359',
      },
    });

    const result = await anonymizeWithSecurityEvents('input', 'pl', ctx);

    expect(recordSecurityEvent).toHaveBeenCalledTimes(1);
    const call = recordSecurityEvent.mock.calls[0][0];
    expect(call.eventType).toBe('CHAT_PII_DETECTED');
    expect(call.severity).toBe('info');
    expect(call.source).toBe('chat');
    expect(call.organizationId).toBe('org_1');
    expect(call.userId).toBe('user_1');
    expect(call.metadata.threadId).toBe('thread_1');
    expect(call.metadata.aliasCount).toBe(3);
    expect(new Set(call.metadata.entityTypes)).toEqual(
      new Set(['EMAIL_ADDRESS', 'PL_PESEL']),
    );
    expect(call.metadata.entityCounts).toEqual({
      EMAIL_ADDRESS: 2,
      PL_PESEL: 1,
    });
    expect(call.metadata.maskingDurationMs).toBe(result.durationMs);
    expect(result.entityTypes).toEqual(call.metadata.entityTypes);
  });

  it('passes null orgId/userId through when caller has no auth context', async () => {
    anonymize.mockResolvedValueOnce({
      maskedText: '<EMAIL_ADDRESS_1>',
      aliasMap: { '<EMAIL_ADDRESS_1>': 'a@b.pl' },
    });

    await anonymizeWithSecurityEvents('input', 'pl', {
      orgId: null,
      userId: null,
      threadId: 'thread_2',
    });

    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        userId: null,
        metadata: expect.objectContaining({ threadId: 'thread_2' }),
      }),
    );
  });
});
