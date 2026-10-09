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

const QUOTES = [
  'Praca zdalna wymaga zgody przełożonego.',
  'Sprzęt  zapewnia\nfirma.',
];

describe('pageBodyForDisplay', () => {
  it('drops the title and the numbered quotes the sources list already shows', () => {
    const body = pageBodyForDisplay(EXTRACTED, 'Praca zdalna', QUOTES);
    expect(body).not.toContain('# Praca zdalna');
    expect(body).not.toContain('---');
    expect(body).not.toContain('„');
    expect(body).toContain('Zasady pracy zdalnej.');
    // Markers stay as written here; linking them is the remark plugin's job.
    expect(body).toContain('przełożonego. [1]');
  });

  it('keeps a numbered list after a rule when it is not this page’s quotes', () => {
    const edited = 'Intro.\n\n---\n\n1. First step\n2. Second step';
    expect(pageBodyForDisplay(edited, 'X', QUOTES)).toBe(edited);
  });

  it('keeps the tail when even one line is not one of the sources', () => {
    const mixed = `${EXTRACTED}3. (§2) „Something no source says.”\n`;
    expect(pageBodyForDisplay(mixed, 'Praca zdalna', QUOTES)).toContain(
      'Something no source says.',
    );
  });

  it('keeps a rule an editor wrote, when what follows is not the quotes', () => {
    const edited = 'Intro.\n\n---\n\nMore text after a rule.';
    expect(pageBodyForDisplay(edited, 'X', QUOTES)).toBe(edited);
  });

  it('keeps a first heading that is not the title', () => {
    expect(pageBodyForDisplay('# Other\n\nText', 'X', QUOTES)).toBe(
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
