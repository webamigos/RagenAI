import { describe, it, expect, vi } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { wrapToolsForConnector } from '../client';

/**
 * Integration test for the Phase 2 tool-gating wrapper: verifies that
 * `wrapToolsForConnector` attaches a `needsApproval` predicate to write
 * tools and that the predicate pauses/allows correctly based on the
 * `experimental_context` threaded through by the chain.
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
      expect(
        wrapped[name].needsApproval,
        `${name} should not have needsApproval`,
      ).toBeUndefined();
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
