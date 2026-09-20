import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { testPolicyAction } = await import('../policy-trial');

const ADMIN = { id: 'admin-1', email: 'a@example.com' };
const DRAFT = {
  policy: 'Never discuss a competitor’s pricing.',
  threshold: 0.8,
  text: 'what does Acme charge?',
};

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  vi.stubEnv('RAGEN_APP_URL', 'http://web.test');
  vi.stubEnv('INTERNAL_API_SECRET', 'shh');
});

describe('testPolicyAction', () => {
  it('asks apps/web, with the acting administrator named', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        outcome: 'scored',
        score: 0.9,
        threshold: 0.8,
        matched: true,
        judgedText: DRAFT.text,
        masked: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await testPolicyAction(DRAFT);

    expect(result).toMatchObject({ outcome: 'scored', matched: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://web.test/api/internal/guardrails/judge-policy');
    expect((init.headers as Record<string, string>)['x-internal-secret']).toBe(
      'shh',
    );
    // The endpoint re-reads this from the database and re-checks the platform
    // role; sending it is what makes that possible. The secret alone would let
    // anything holding it spend money on a judge model.
    expect(JSON.parse(init.body as string)).toMatchObject({
      adminUserId: ADMIN.id,
      policy: DRAFT.policy,
      threshold: 0.8,
    });
  });

  it('requires an administrator before reaching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    requireAdmin.mockRejectedValue(new Error('nope'));

    await expect(testPolicyAction(DRAFT)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['RAGEN_APP_URL', 'RAGEN_APP_URL'],
    ['INTERNAL_API_SECRET', 'INTERNAL_API_SECRET'],
  ])(
    'says so when %s is missing rather than failing opaquely',
    async (_l, name) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      vi.stubEnv(name, '');

      const result = await testPolicyAction(DRAFT);

      expect(result.outcome).toBe('unavailable');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('refuses an empty policy without spending a model call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await testPolicyAction({ ...DRAFT, policy: '  ' });

    expect(result.outcome).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty message without spending a model call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await testPolicyAction({ ...DRAFT, text: '   ' });

    expect(result.outcome).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relays the reason apps/web gave rather than a bare status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'analyzer is down' }, 503)),
    );

    expect(await testPolicyAction(DRAFT)).toEqual({
      outcome: 'unavailable',
      reason: 'analyzer is down',
    });
  });

  /**
   * A fetch failure carries the request it sent, and the request body here is
   * the operator's pasted message. The C2 lesson — a `{ err }` in a structured
   * logger copies every enumerable property — applied to the panel.
   */
  it('reports a transport failure without quoting what was sent', async () => {
    const boom = new Error(`connect ECONNREFUSED ${DRAFT.text}`);
    boom.name = 'TypeError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(boom));

    const result = await testPolicyAction(DRAFT);

    expect(result.outcome).toBe('unavailable');
    expect('reason' in result && result.reason).not.toContain(DRAFT.text);
  });
});

describe('what a trial leaves behind', () => {
  /**
   * The only record. No AI-usage row is written — `AiUsage.organizationId` is
   * required and a platform administrator has no tenant to bill — so without
   * this entry a judge model could be called repeatedly with nothing anywhere
   * saying who did it.
   */
  it('audits a successful trial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          outcome: 'scored',
          score: 0.91,
          threshold: 0.8,
          matched: true,
          judgedText: DRAFT.text,
          masked: false,
        }),
      ),
    );

    await testPolicyAction(DRAFT);

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.guardrail.policy_tested',
        after: expect.objectContaining({ outcome: 'scored', score: 0.91 }),
      }),
    );
  });

  it('audits a trial that never ran', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    await testPolicyAction(DRAFT);

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.guardrail.policy_tested',
        after: expect.objectContaining({ outcome: 'unavailable', score: null }),
      }),
    );
  });

  /**
   * An audit entry is read by people who are not the operator who wrote it.
   * The pasted message and the policy prose both stay out of it.
   */
  it('records the score and never the text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          outcome: 'scored',
          score: 0.2,
          threshold: 0.8,
          matched: false,
          judgedText: DRAFT.text,
          masked: false,
        }),
      ),
    );

    await testPolicyAction(DRAFT);

    const entry = JSON.stringify(recordAdminAction.mock.calls[0]![0]);
    expect(entry).not.toContain(DRAFT.text);
    expect(entry).not.toContain(DRAFT.policy);
  });
});
