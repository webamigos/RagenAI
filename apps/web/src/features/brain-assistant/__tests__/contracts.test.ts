import { describe, expect, it } from 'vitest';

import {
  brainAssistantTurnSchema,
  brainProposalInputSchema,
  brainScreenContextSchema,
  MAX_BATCH_PAGES,
  proposalDecisionInputSchema,
} from '../contracts/brain-assistant.types';

const ID = '11111111-2222-4333-8444-555555555555';

describe('brainScreenContextSchema', () => {
  it('accepts every view the Brain screens send', () => {
    for (const screen of [
      { view: 'pages', status: null },
      { view: 'pages', status: 'CANDIDATE' },
      { view: 'inbox', status: 'OPEN', type: 'CONTRADICTION' },
      { view: 'finding', findingId: ID },
      { view: 'page', pageId: ID },
      {
        view: 'graph',
        focusPageId: ID,
        selectedPageId: ID,
        communityFilter: 2,
      },
      { view: 'documents', selectedFileIds: [ID] },
    ]) {
      expect(brainScreenContextSchema.safeParse(screen).success).toBe(true);
    }
  });

  it('fills the defaults a page may leave out', () => {
    expect(brainScreenContextSchema.parse({ view: 'inbox' })).toEqual({
      view: 'inbox',
      status: 'OPEN',
    });
    expect(brainScreenContextSchema.parse({ view: 'documents' })).toEqual({
      view: 'documents',
      selectedFileIds: [],
    });
  });

  it('refuses an unknown view, a malformed id and an unknown filter', () => {
    expect(brainScreenContextSchema.safeParse({ view: 'chat' }).success).toBe(
      false,
    );
    expect(
      brainScreenContextSchema.safeParse({ view: 'page', pageId: '1 OR 1=1' })
        .success,
    ).toBe(false);
    expect(
      brainScreenContextSchema.safeParse({ view: 'inbox', type: 'WHATEVER' })
        .success,
    ).toBe(false);
  });
});

describe('brainAssistantTurnSchema', () => {
  it('takes a question and a screen, and a thread when continuing', () => {
    expect(
      brainAssistantTurnSchema.safeParse({
        question: ' What first? ',
        screen: { view: 'inbox' },
      }),
    ).toMatchObject({ success: true, data: { question: 'What first?' } });
    expect(
      brainAssistantTurnSchema.safeParse({
        threadId: ID,
        question: 'x',
        screen: { view: 'inbox' },
      }).success,
    ).toBe(true);
  });

  it('refuses an empty or oversized question and a forged thread id', () => {
    const screen = { view: 'inbox' };
    expect(
      brainAssistantTurnSchema.safeParse({ question: '   ', screen }).success,
    ).toBe(false);
    expect(
      brainAssistantTurnSchema.safeParse({
        question: 'x'.repeat(4001),
        screen,
      }).success,
    ).toBe(false);
    expect(
      brainAssistantTurnSchema.safeParse({
        threadId: 'nope',
        question: 'x',
        screen,
      }).success,
    ).toBe(false);
  });
});

describe('brainProposalInputSchema', () => {
  it('accepts each action in its own shape', () => {
    for (const input of [
      { action: 'APPROVE', pageIds: [ID], reason: 'Quotes verified' },
      { action: 'UNPUBLISH', pageIds: [ID, ID], reason: 'Outdated' },
      { action: 'MERGE', sourcePageId: ID, targetPageId: ID, reason: 'Same' },
      { action: 'SET_OWNER', pageId: ID, ownerId: 'u-1', reason: 'Author' },
      { action: 'SET_ACCESS', pageId: ID, principals: ['org:o'], reason: 'r' },
      { action: 'RETRY_EXTRACTION', findingId: ID, reason: 'Transient' },
    ]) {
      expect(brainProposalInputSchema.safeParse(input).success).toBe(true);
    }
  });

  it('refuses an action Brain has no button for', () => {
    for (const action of ['VERIFY', 'RESOLVE_FINDING', 'DISMISS_FINDING']) {
      expect(
        brainProposalInputSchema.safeParse({
          action,
          pageIds: [ID],
          reason: 'r',
        }).success,
      ).toBe(false);
    }
  });

  it('refuses a proposal without a reason, with no pages, or too many', () => {
    expect(
      brainProposalInputSchema.safeParse({ action: 'APPROVE', pageIds: [ID] })
        .success,
    ).toBe(false);
    expect(
      brainProposalInputSchema.safeParse({
        action: 'APPROVE',
        pageIds: [],
        reason: 'r',
      }).success,
    ).toBe(false);
    expect(
      brainProposalInputSchema.safeParse({
        action: 'APPROVE',
        pageIds: Array.from({ length: MAX_BATCH_PAGES + 1 }, () => ID),
        reason: 'r',
      }).success,
    ).toBe(false);
  });

  it('refuses a shape that belongs to another action', () => {
    expect(
      brainProposalInputSchema.safeParse({
        action: 'MERGE',
        pageIds: [ID],
        reason: 'r',
      }).success,
    ).toBe(false);
  });
});

describe('proposalDecisionInputSchema', () => {
  it('names a stored proposal and defaults confirmWidening to false', () => {
    expect(
      proposalDecisionInputSchema.parse({
        threadId: ID,
        messageId: ID,
        proposalId: 'p-1',
      }),
    ).toEqual({
      threadId: ID,
      messageId: ID,
      proposalId: 'p-1',
      confirmWidening: false,
    });
  });

  it('refuses a missing message or a forged thread', () => {
    expect(
      proposalDecisionInputSchema.safeParse({
        threadId: ID,
        proposalId: 'p',
      }).success,
    ).toBe(false);
    expect(
      proposalDecisionInputSchema.safeParse({
        threadId: 'x',
        messageId: ID,
        proposalId: 'p',
      }).success,
    ).toBe(false);
  });
});
