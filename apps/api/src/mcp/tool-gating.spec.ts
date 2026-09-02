import { wrapToolsForConnector } from './client.js';
import { type RecordSecurityEvent } from '../security/types.js';

/**
 * Integration test for the Phase 2 tool-gating wrapper: verifies that
 * `wrapToolsForConnector` attaches a `needsApproval` predicate to write
 * tools and that the predicate pauses/allows correctly based on the
 * `experimental_context` threaded through by the chain.
 *
 * Ported from ragen-app's src/libs/mcp/__tests__/tool-gating.test.ts —
 * `recordSecurityEvent` is now an injected callback parameter (third arg)
 * instead of a mocked module import; see client.ts's port note.
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
    // Declaring the parameter is what makes `mock.calls[0][0]` typed; without
    // it the call tuple is empty and the assertions below cannot compile.
    execute: jest.fn((_args: Record<string, unknown>) =>
      Promise.resolve({ ok: true }),
    ),
  };
}

describe('wrapToolsForConnector — write tool gating', () => {
  it('attaches needsApproval to write tools', () => {
    const wrapped = wrapToolsForConnector(
      {
        gcal_create_event: makeFakeTool(),
        gcal_list_events: makeFakeTool(),
      },
      'customer-1',
    );

    expect(typeof wrapped.gcal_create_event.needsApproval).toBe('function');
    expect(wrapped.gcal_list_events.needsApproval).toBeUndefined();
  });

  it('needsApproval returns true when RAG context is present and not pre-approved', () => {
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: makeFakeTool() },
      'customer-1',
    );

    const result = wrapped.gcal_create_event.needsApproval(
      { summary: 'Team sync' },
      {
        toolCallId: 'tc-1',
        experimental_context: {
          ragContextPresent: true,
          approvedToolCalls: [],
        },
      },
    );

    expect(result).toBe(true);
  });

  it('needsApproval returns false when RAG context is absent', () => {
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: makeFakeTool() },
      'customer-1',
    );

    const result = wrapped.gcal_create_event.needsApproval(
      { summary: 'Team sync' },
      {
        toolCallId: 'tc-1',
        experimental_context: {
          ragContextPresent: false,
          approvedToolCalls: [],
        },
      },
    );

    expect(result).toBe(false);
  });

  it('needsApproval returns false when the toolCallId is in approvedToolCalls', () => {
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: makeFakeTool() },
      'customer-1',
    );

    const result = wrapped.gcal_create_event.needsApproval(
      { summary: 'Team sync' },
      {
        toolCallId: 'tc-1',
        experimental_context: {
          ragContextPresent: true,
          approvedToolCalls: ['tc-1'],
        },
      },
    );

    expect(result).toBe(false);
  });

  it('needsApproval returns false when experimental_context is missing', () => {
    // Non-RAG flow (conversation chain, guest chat, etc.) must not
    // accidentally gate every write tool.
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: makeFakeTool() },
      'customer-1',
    );

    const result = wrapped.gcal_create_event.needsApproval(
      { summary: 'Team sync' },
      { toolCallId: 'tc-1' },
    );

    expect(result).toBe(false);
  });

  it('does not attach needsApproval to read tools (nothing to pause)', () => {
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
    const wrapped = wrapToolsForConnector(input, 'customer-1');

    for (const name of readTools) {
      expect(wrapped[name].needsApproval).toBeUndefined();
    }
  });

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
    const passedArgs = fake.execute.mock.calls[0][0];
    expect(passedArgs.customer_id).toBe('customer-1');
    expect(passedArgs.q).toBe('test');
  });
});

describe('wrapToolsForConnector — Phase 3 arg inspection', () => {
  let recordSecurityEvent: jest.MockedFunction<RecordSecurityEvent>;

  beforeEach(() => {
    recordSecurityEvent = jest.fn();
  });

  it('passes low-risk write tool args straight through', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      'customer-1',
      recordSecurityEvent,
    );

    const result = await wrapped.gcal_create_event.execute(
      { summary: 'Team sync', description: 'Weekly meeting' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect((result as { ok: boolean }).ok).toBe(true);
    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });

  it('blocks a write tool with a secret in its args and returns an error result', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      'customer-1',
      recordSecurityEvent,
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
    expect(recordSecurityEvent).toHaveBeenCalledTimes(1);
    const eventArg = recordSecurityEvent.mock.calls[0][0];
    expect(eventArg.eventType).toBe('TOOL_ARGS_HIGH_RISK');
    expect(eventArg.source).toBe('mcp');
    expect((eventArg.metadata as Record<string, unknown>).risk).toBe('high');
    expect((eventArg.metadata as Record<string, unknown>).toolName).toBe(
      'gcal_create_event',
    );
  });

  it('fires a TOOL_ARGS_HIGH_RISK audit event on medium risk but still executes', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      'customer-1',
      recordSecurityEvent,
    );

    // A 300-char base64-like blob: weight 3 → medium
    await wrapped.gcal_create_event.execute(
      { summary: 'Event', description: 'A'.repeat(300) },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1); // medium does NOT block
    expect(recordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(
      (recordSecurityEvent.mock.calls[0][0].metadata as Record<string, unknown>)
        .risk,
    ).toBe('medium');
  });

  it('does not inspect read tools (no side-effect, nothing to leak)', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gmail_search_messages: fake },
      'customer-1',
      recordSecurityEvent,
    );

    // Even with a secret in the args — inspection should not fire
    // because read tools can't exfiltrate and we want zero false-
    // positive friction on search tools.
    await wrapped.gmail_search_messages.execute(
      { q: 'Bearer abc1234567890xyzdef' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(recordSecurityEvent).not.toHaveBeenCalled();
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
      recordSecurityEvent,
    );

    await wrapped.gcal_create_event.execute(
      { summary: 'Event' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).toHaveBeenCalledTimes(1);
    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });

  it('does not throw when recordSecurityEvent is not provided (no-op)', async () => {
    const fake = makeFakeTool();
    const wrapped = wrapToolsForConnector(
      { gcal_create_event: fake },
      'customer-1',
    );

    const result = await wrapped.gcal_create_event.execute(
      { description: 'Bearer abc1234567890xyzdef' },
      { toolCallId: 'tc-1' },
    );

    expect(fake.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: 'BLOCKED_SUSPICIOUS_ARGS' });
  });
});
