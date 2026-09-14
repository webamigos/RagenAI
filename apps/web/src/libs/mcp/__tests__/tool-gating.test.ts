import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockRecordSecurityEvent = vi.fn();
vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({
    recordSecurityEvent: (...args: unknown[]) =>
      mockRecordSecurityEvent(...args),
  }),
);

import { buildToolApprovalConfig, wrapToolsForConnector } from '../client';

/**
 * Integration test for the Phase 2 tool gating: verifies that write tools get
 * an approval decision and that it pauses or allows correctly based on the
 * gating context threaded through by the chain as `runtimeContext`.
 */

function makeFakeTool() {
  return {
    description: 'fake',
    parameters: {
      jsonSchema: {
        type: 'object',
        properties: { foo: { type: 'string' } },
      },
    },
    execute: vi.fn(async () => ({ ok: true })),
  };
}

/**
 * Approval is configuration of the *call* in AI SDK 7, not a property of the
 * tool: `needsApproval` is gone and `buildToolApprovalConfig` produces the
 * `toolApproval` map handed to `streamText`. These tests moved with it.
 *
 * The behaviours are the ones the old `needsApproval` predicate had, with one
 * deliberate inversion — see the missing-context case.
 */
describe('buildToolApprovalConfig — write tool gating', () => {
  it('builds an entry for write tools and none for read tools', () => {
    const config = buildToolApprovalConfig({
      gcal_create_event: makeFakeTool(),
      gcal_list_events: makeFakeTool(),
    });

    expect(typeof config.gcal_create_event).toBe('function');
    expect(config.gcal_list_events).toBeUndefined();
  });

  it('asks for approval when RAG context is present and the call is not pre-approved', () => {
    const config = buildToolApprovalConfig({
      gcal_create_event: makeFakeTool(),
    });

    const decision = config.gcal_create_event(
      { summary: 'Team sync' },
      {
        toolCallId: 'tc-1',
        runtimeContext: { ragContextPresent: true, approvedToolCalls: [] },
      },
    );

    expect(decision).toBe('user-approval');
  });

  it('does not ask when no RAG content is in the prompt', () => {
    const config = buildToolApprovalConfig({
      gcal_create_event: makeFakeTool(),
    });

    const decision = config.gcal_create_event(
      { summary: 'Team sync' },
      {
        toolCallId: 'tc-1',
        runtimeContext: { ragContextPresent: false, approvedToolCalls: [] },
      },
    );

    expect(decision).toBe('not-applicable');
  });

  it('does not ask twice for a call the user already approved', () => {
    const config = buildToolApprovalConfig({
      gcal_create_event: makeFakeTool(),
    });

    const decision = config.gcal_create_event(
      { summary: 'Team sync' },
      {
        toolCallId: 'tc-1',
        runtimeContext: {
          ragContextPresent: true,
          approvedToolCalls: ['tc-1'],
        },
      },
    );

    expect(decision).toBe('not-applicable');
  });

  it('fails closed when the runtime context is missing', () => {
    // This assertion is inverted from the one it replaces. The context used to
    // arrive as `experimental_context`, which AI SDK 7 removed; under the old
    // rule a missing context meant "not a RAG flow, let it through", so this
    // very rename would have silently ungated every write tool while RAG
    // content sat in the prompt. A caller that threads no context is now a
    // programming error, and the cost of being wrong is one confirmation
    // prompt rather than an unreviewed write. Non-RAG callers say
    // `ragContextPresent: false` explicitly instead of saying nothing.
    const config = buildToolApprovalConfig({
      gcal_create_event: makeFakeTool(),
    });

    const decision = config.gcal_create_event(
      { summary: 'Team sync' },
      { toolCallId: 'tc-1' },
    );

    expect(decision).toBe('user-approval');
  });

  it('builds no entry for any known read tool (nothing to pause)', () => {
    const readTools = [
      'gmail_search_messages',
      'drive_search_files',
      'gcal_list_events',
      'hubspot_get_crm_objects',
    ];
    const input: Record<string, ReturnType<typeof makeFakeTool>> = {};
    for (const name of readTools) {
      input[name] = makeFakeTool();
    }

    const config = buildToolApprovalConfig(input);

    for (const name of readTools) {
      expect(config[name], `${name} should not be gated`).toBeUndefined();
    }
  });
});

describe('wrapToolsForConnector — customer_id injection', () => {
  it('execute still runs as before for read tools (customer_id injected)', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gmail_search_messages: fake },
      'customer-1',
    );

    await wrapped.gmail_search_messages.execute(
      { q: 'test' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1);
    const passedArgs = (fake.execute as any).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(passedArgs.customer_id).toBe('customer-1');
    expect(passedArgs.q).toBe('test');
  });
});

describe('wrapToolsForConnector — Phase 3 arg inspection', () => {
  beforeEach(() => {
    mockRecordSecurityEvent.mockClear();
  });

  it('passes low-risk write tool args straight through', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      'customer-1',
    );

    const result = await wrapped.gcal_create_event.execute(
      { summary: 'Team sync', description: 'Weekly meeting' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
  });

  it('blocks a write tool with a secret in its args and returns an error result', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      'customer-1',
    );

    const result = await wrapped.gcal_create_event.execute(
      {
        summary: 'Meeting',
        description: 'Token for later: Bearer abc1234567890xyzdef',
      },
      { toolCallId: 'tc-1' },
    );

    // The inner tool was NOT called — the wrapper short-circuited.
    expect(fake.execute).not.toHaveBeenCalled();
    // Error result includes the block code so the LLM can explain
    // the failure to the user.
    expect(result).toMatchObject({
      error: 'BLOCKED_SUSPICIOUS_ARGS',
    });
    // Audit event fired exactly once with TOOL_ARGS_HIGH_RISK.
    expect(mockRecordSecurityEvent).toHaveBeenCalledTimes(1);
    const eventArg = mockRecordSecurityEvent.mock.calls[0][0];
    expect(eventArg.eventType).toBe('TOOL_ARGS_HIGH_RISK');
    expect(eventArg.source).toBe('mcp');
    expect(eventArg.metadata.risk).toBe('high');
    expect(eventArg.metadata.toolName).toBe('gcal_create_event');
  });

  it('fires a TOOL_ARGS_HIGH_RISK audit event on medium risk but still executes', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      'customer-1',
    );

    // A 300-char base64-like blob: weight 3 → medium
    await wrapped.gcal_create_event.execute(
      { summary: 'Event', description: 'A'.repeat(300) },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1); // medium does NOT block
    expect(mockRecordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordSecurityEvent.mock.calls[0][0].metadata.risk).toBe(
      'medium',
    );
  });

  it('does not inspect read tools (no side-effect, nothing to leak)', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gmail_search_messages: fake },
      'customer-1',
    );

    // Even with a secret in the args — inspection should not fire
    // because read tools can't exfiltrate and we want zero false-
    // positive friction on search tools.
    await wrapped.gmail_search_messages.execute(
      { q: 'Bearer abc1234567890xyzdef' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
  });

  it('excludes the injected customer_id from inspection (no false positive on trusted id)', async () => {
    // Use a customer_id shaped like a suspicious value to prove the
    // inspector ignores it. The test ensures our exclusion works.
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      // Deliberately a long base64-shaped string — would trip the
      // longBase64 signal if it reached the inspector.
      'A'.repeat(300),
    );

    await wrapped.gcal_create_event.execute(
      { summary: 'Event' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(mockRecordSecurityEvent).not.toHaveBeenCalled();
  });
});
