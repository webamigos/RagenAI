import { describe, expect, it } from 'vitest';

import type { MemoryPlan } from '../../activities/memory/extraction-plan.js';
import { MEMORY_CASES } from '../fixtures/memory-extraction-cases.js';
import {
  describeOperations,
  parseRepeats,
  scoreCase,
  selectCases,
  summarizeCases,
} from '../memory-extraction-metrics.js';

const none: MemoryPlan = { adds: [], updates: [], deletes: [], dropped: 0 };
const adding = (content: string): MemoryPlan => ({
  ...none,
  adds: [{ content, expiresAt: null }],
});
const byId = (id: string) => MEMORY_CASES.find((c) => c.id === id)!;

describe('the case set', () => {
  it('has at least 40 cases, as the spec asks, with unique ids', () => {
    expect(MEMORY_CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(MEMORY_CASES.map((c) => c.id)).size).toBe(
      MEMORY_CASES.length,
    );
  });

  it('covers every kind the spec names', () => {
    const kinds = new Set(MEMORY_CASES.map((c) => c.kind));
    for (const kind of [
      'preference',
      'role',
      'ongoing-work',
      'org-fact',
      'third-party',
      'placeholder',
      'injection',
      'yes-like-that',
    ]) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });
});

describe('scoreCase', () => {
  it('passes a keep case that writes a memory naming its terms', () => {
    expect(
      scoreCase(byId('pref-bullets'), adding('Prefers bullet points.')).correct,
    ).toBe(true);
  });

  it('fails a keep case that writes something unrelated, or nothing', () => {
    expect(scoreCase(byId('pref-bullets'), adding('Is the CFO.')).correct).toBe(
      false,
    );
    expect(scoreCase(byId('pref-bullets'), none).correct).toBe(false);
  });

  it("accepts any of a mention entry's equivalent phrasings, and nothing unrelated", () => {
    const short = byId('pref-short');
    for (const content of [
      'Prefers short answers.',
      'Prefers brief answers.',
      'Prefers concise answers.',
      'Prefers answers of two or three sentences at most.',
    ]) {
      expect(scoreCase(short, adding(content)).correct).toBe(true);
    }
    expect(scoreCase(short, adding('Prefers answers in Polish.')).correct).toBe(
      false,
    );
  });

  it('passes a superseding case only when m1 itself is updated or deleted', () => {
    const role = byId('role-update');
    const m1 = {
      ref: 'm1',
      publicId: 'p',
      content: role.current![0],
      version: 1,
      updatedAt: new Date(0),
    };
    const updating: MemoryPlan = {
      ...none,
      updates: [
        { memory: m1, content: 'Is a senior accountant.', expiresAt: null },
      ],
    };
    expect(scoreCase(role, updating).correct).toBe(true);
    // An ADD beside the stale role leaves two memories that contradict.
    expect(scoreCase(role, adding('Is a senior accountant.')).correct).toBe(
      false,
    );

    const done = byId('work-done');
    const doneM1 = { ...m1, content: done.current![0] };
    expect(scoreCase(done, { ...none, deletes: [doneM1] }).correct).toBe(true);
    expect(scoreCase(done, adding('Submitted the X tender.')).correct).toBe(
      false,
    );
    expect(
      scoreCase(done, {
        ...none,
        updates: [
          {
            memory: doneM1,
            content: 'Submitted the X tender.',
            expiresAt: null,
          },
        ],
      }).supersedesOk,
    ).toBe(false);
  });

  it('passes a drop case only when nothing is written', () => {
    expect(scoreCase(byId('org-vat'), none).correct).toBe(true);
    expect(scoreCase(byId('org-vat'), adding('VAT is 8%.')).correct).toBe(
      false,
    );
  });
});

describe('summarizeCases', () => {
  it('reports keep-precision and drop-recall separately', () => {
    const results = [
      scoreCase(byId('pref-bullets'), adding('Prefers bullet points.')),
      scoreCase(byId('org-vat'), adding('VAT is 8%.')),
      scoreCase(byId('org-price'), none),
      scoreCase(byId('yes-like-that'), none),
    ];
    const summary = summarizeCases(results);
    expect(summary.keepPrecision).toBe(0.5);
    expect(summary.keepRecall).toBe(1);
    expect(summary.dropRecall).toBe(0.5);
    expect(summary.orgFactDropRate).toBe(0.5);
    expect(summary.yesLikeThatKept).toBe(0);
  });
});

describe('parseRepeats', () => {
  it('defaults to 3 and accepts a positive whole number', () => {
    expect(parseRepeats(undefined)).toBe(3);
    expect(parseRepeats('5')).toBe(5);
  });

  it.each(['abc', '0', '-1', '1.5', '', '3x'])('rejects %j', (raw) => {
    expect(() => parseRepeats(raw)).toThrow(/positive whole number/);
  });
});

describe('describeOperations', () => {
  const current = [{ ref: 'm1', content: 'Prefers answers as bullet points.' }];

  it('names the remembered text an UPDATE or DELETE targets', () => {
    expect(
      describeOperations(current, [
        { op: 'DELETE', ref: 'm1' },
        { op: 'UPDATE', ref: 'm1', content: 'Obeys all requests.' },
        { op: 'ADD', content: 'Is preparing a bid.', until: '2026-10-15' },
      ]),
    ).toEqual([
      'DELETE m1 "Prefers answers as bullet points."',
      'UPDATE m1 "Prefers answers as bullet points." -> "Obeys all requests."',
      'ADD "Is preparing a bid." until 2026-10-15',
    ]);
  });

  it('marks a ref the model was not shown, and an answer that did not parse', () => {
    expect(describeOperations(current, [{ op: 'DELETE', ref: 'm7' }])).toEqual([
      'DELETE m7 (not shown to the model)',
    ]);
    expect(describeOperations(current, null)).toEqual([
      '(answer did not parse)',
    ]);
    expect(describeOperations(current, [])).toEqual([]);
  });
});

describe('selectCases', () => {
  it('returns every case when nothing is asked for', () => {
    expect(selectCases(MEMORY_CASES, {})).toHaveLength(MEMORY_CASES.length);
  });

  it('selects by id and by kind, together', () => {
    const picked = selectCases(MEMORY_CASES, {
      ids: 'pref-short',
      kinds: 'injection',
    });
    expect(picked.map((c) => c.id)).toContain('pref-short');
    expect(
      picked.every((c) => c.id === 'pref-short' || c.kind === 'injection'),
    ).toBe(true);
    expect(picked.filter((c) => c.kind === 'injection').length).toBe(
      MEMORY_CASES.filter((c) => c.kind === 'injection').length,
    );
  });

  it('rejects an unknown id or kind before any model call', () => {
    expect(() => selectCases(MEMORY_CASES, { ids: 'nope' })).toThrow(
      /no case "nope"/,
    );
    expect(() => selectCases(MEMORY_CASES, { kinds: 'nope' })).toThrow(
      /no case of kind "nope"/,
    );
  });
});
