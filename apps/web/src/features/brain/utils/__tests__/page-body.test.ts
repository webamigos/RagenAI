import { describe, expect, it } from 'vitest';

import type { KnowledgeDecisionView } from '../../contracts/brain.types';
import { pageBodyForDisplay, statusDecision } from '../page-body';

const EXTRACTED = [
  '# Praca zdalna',
  '',
  'Zasady pracy zdalnej.',
  '',
  '- Praca zdalna wymaga zgody przełożonego. [1]',
  '- Sprzęt zapewnia firma. [2]',
  '',
  '---',
  '',
  '1. (§1) „Praca zdalna wymaga zgody przełożonego.”',
  '2. (§1) „Sprzęt zapewnia firma.”',
  '',
].join('\n');

const anchors = (n: number) => (n <= 2 ? `source-s${n}` : null);

describe('pageBodyForDisplay', () => {
  it('drops the title and the numbered quotes the sources list already shows', () => {
    const body = pageBodyForDisplay(EXTRACTED, 'Praca zdalna', anchors);
    expect(body).not.toContain('# Praca zdalna');
    expect(body).not.toContain('---');
    expect(body).not.toContain('„');
    expect(body).toContain('Zasady pracy zdalnej.');
  });

  it('links each marker to its source', () => {
    const body = pageBodyForDisplay(EXTRACTED, 'Praca zdalna', anchors);
    expect(body).toContain('przełożonego. [\\[1\\]](#source-s1)');
    expect(body).toContain('firma. [\\[2\\]](#source-s2)');
  });

  it('leaves a marker with no source as written', () => {
    expect(pageBodyForDisplay('- Claim. [3]', 'X', anchors)).toBe(
      '- Claim. [3]',
    );
  });

  it('keeps a rule an editor wrote, when what follows is not the quotes', () => {
    const edited = 'Intro.\n\n---\n\nMore text after a rule.';
    expect(pageBodyForDisplay(edited, 'X', anchors)).toBe(edited);
  });

  it('keeps a first heading that is not the title', () => {
    expect(pageBodyForDisplay('# Other\n\nText', 'X', anchors)).toBe(
      '# Other\n\nText',
    );
  });
});

const row = (
  action: KnowledgeDecisionView['action'],
  createdAt: string,
): KnowledgeDecisionView => ({ action, actorName: 'Joe Doe', createdAt });

describe('statusDecision', () => {
  const ledger = [
    row('PUBLISH', '2026-10-05T10:00:00Z'),
    row('APPROVE', '2026-10-04T17:23:00Z'),
    row('SET_OWNER', '2026-10-04T17:00:00Z'),
    row('APPROVE', '2026-09-01T09:00:00Z'),
  ];

  it('finds the newest decision that set the current status', () => {
    expect(statusDecision('APPROVED', ledger)).toEqual(ledger[1]);
  });

  it('counts a merge as what rejected a page', () => {
    expect(
      statusDecision('REJECTED', [row('MERGE', '2026-10-01T00:00:00Z')])
        ?.action,
    ).toBe('MERGE');
  });

  it('has nothing to say for a page still to review', () => {
    expect(statusDecision('CANDIDATE', ledger)).toBeNull();
  });
});
