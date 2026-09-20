import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const recordInternalAuthFailure = vi.fn();
vi.mock('@/app/api/v1/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/api/v1/utils')>()),
  recordInternalAuthFailure: (...a: unknown[]) =>
    recordInternalAuthFailure(...a),
}));

const judge = vi.fn();
vi.mock('@/features/guardrails/utils/policy-judge', () => ({
  createPolicyJudge: (...a: unknown[]) => {
    createPolicyJudge(...a);
    return judge;
  },
}));
const createPolicyJudge = vi.fn();

const isPiiMaskingEnabled = vi.fn(() => false);
vi.mock('@/libs/pii/anonymize-with-security-events', () => ({
  isPiiMaskingEnabled: () => isPiiMaskingEnabled(),
}));

const anonymize = vi.fn();
vi.mock('@/libs/pii/presidio-client', () => ({
  presidioClient: { anonymize: (...a: unknown[]) => anonymize(...a) },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

const { POST } = await import('../route');

const ADMIN = { id: 'admin-1', role: 'admin', banned: false };
const BODY = {
  policy: 'Never discuss a competitor’s pricing.',
  threshold: 0.8,
  text: 'what does Acme charge, and call me on 555-0100?',
  adminUserId: ADMIN.id,
};

const post = (body: unknown, secret = 'shh') =>
  POST(
    new NextRequest('http://localhost/api/internal/guardrails/judge-policy', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('INTERNAL_API_SECRET', 'shh');
  findUnique.mockResolvedValue(ADMIN);
  isPiiMaskingEnabled.mockReturnValue(false);
  judge.mockResolvedValue({ outcome: 'scored', score: 0.9 });
});

describe('the two gates', () => {
  it('refuses a caller with the wrong secret', async () => {
    const response = await post(BODY, 'wrong');

    expect(response.status).toBe(401);
    expect(judge).not.toHaveBeenCalled();
    expect(recordInternalAuthFailure).toHaveBeenCalled();
  });

  /**
   * The secret alone is not enough. Anything holding it could otherwise spend
   * money on a judge model, so the named administrator is re-read from the
   * database and must still hold the platform role.
   */
  it.each([
    ['a user who no longer exists', null],
    ['a banned administrator', { ...ADMIN, banned: true }],
    ['a user who is not a platform admin', { ...ADMIN, role: 'user' }],
  ])('refuses %s', async (_label, user) => {
    findUnique.mockResolvedValue(user);

    const response = await post(BODY);

    expect(response.status).toBe(403);
    expect(judge).not.toHaveBeenCalled();
  });
});

describe('what it will judge', () => {
  it('refuses a policy with no prose, rather than asking the model', async () => {
    const response = await post({ ...BODY, policy: '   ' });

    // 400 from the schema's `min(1)` or 422 from the shared gate; either way
    // the point is that no model call was made for an unanswerable question.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(judge).not.toHaveBeenCalled();
  });

  it.each([-0.1, 1.5])('refuses %p as a threshold', async (threshold) => {
    const response = await post({ ...BODY, threshold });

    expect(response.status).toBe(400);
    expect(judge).not.toHaveBeenCalled();
  });

  it('scores the draft and reports the threshold it applied', async () => {
    judge.mockResolvedValue({ outcome: 'scored', score: 0.91 });

    const body = await (await post(BODY)).json();

    expect(body).toMatchObject({
      outcome: 'scored',
      score: 0.91,
      threshold: 0.8,
      matched: true,
      masked: false,
    });
  });

  it('applies the judge default when the draft names no threshold', async () => {
    judge.mockResolvedValue({ outcome: 'scored', score: 0.5 });

    const body = await (await post({ ...BODY, threshold: null })).json();

    expect(body).toMatchObject({ threshold: 0.7, matched: false, score: 0.5 });
  });

  it('reports a judge that could not answer, never as a zero', async () => {
    judge.mockResolvedValue({ outcome: 'error', reason: 'timeout' });

    const body = await (await post(BODY)).json();

    expect(body).toEqual(
      expect.objectContaining({ outcome: 'error', reason: 'timeout' }),
    );
    expect(body).not.toHaveProperty('score');
  });

  /**
   * The bill. A trial is a platform-admin action with no tenant, and
   * `AiUsage.organizationId` is required — so the judge is built with no
   * tracking context and writes no usage row. Asserted because the failure is
   * the opposite one: a future change passing an organization here would put a
   * number on some tenant's page that nobody in it caused.
   */
  it('builds a judge with no tenant to bill', async () => {
    await post(BODY);

    expect(createPolicyJudge).toHaveBeenCalledWith({ tracking: undefined });
  });
});

describe('masking, so the trial judges what a turn would', () => {
  /**
   * The single way this box could be worse than no box. The input stage runs
   * downstream of Presidio, so a policy is judged against `<PHONE_NUMBER_1>`
   * — and an operator tuning a threshold against a score for raw text would be
   * tuning against a string no turn produces.
   */
  it('judges the masked text when this installation masks', async () => {
    isPiiMaskingEnabled.mockReturnValue(true);
    anonymize.mockResolvedValue({
      maskedText: 'what does Acme charge, and call me on <PHONE_NUMBER_1>?',
      aliasMap: {},
    });

    const body = await (await post(BODY)).json();

    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0]![0].prompt).toContain('<PHONE_NUMBER_1>');
    expect(judge.mock.calls[0]![0].prompt).not.toContain('555-0100');
    // Returned as well as used, so the caveat is something the operator sees
    // rather than a sentence under the field.
    expect(body).toMatchObject({
      masked: true,
      judgedText: expect.stringContaining('<PHONE_NUMBER_1>'),
    });
  });

  it('masks in the same language the chat path does', async () => {
    isPiiMaskingEnabled.mockReturnValue(true);
    anonymize.mockResolvedValue({ maskedText: 'x', aliasMap: {} });

    await post(BODY);

    const { PII_MASKING_LANGUAGE } =
      await import('@/libs/pii/masking-language');
    expect(anonymize).toHaveBeenCalledWith(BODY.text, PII_MASKING_LANGUAGE);
  });

  it('does not judge unmasked text when the analyzer is down', async () => {
    isPiiMaskingEnabled.mockReturnValue(true);
    anonymize.mockRejectedValue(new Error('Presidio analyzer unavailable'));

    const response = await post(BODY);

    expect(response.status).toBe(503);
    expect(judge).not.toHaveBeenCalled();
  });

  it('leaves the text alone when this installation does not mask', async () => {
    const body = await (await post(BODY)).json();

    expect(anonymize).not.toHaveBeenCalled();
    expect(body).toMatchObject({ masked: false, judgedText: BODY.text });
  });
});
