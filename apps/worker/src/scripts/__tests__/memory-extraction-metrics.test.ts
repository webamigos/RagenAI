import { describe, expect, it } from 'vitest';

import type { MemoryPlan } from '../../activities/memory/extraction-plan.js';
import { MEMORY_CASES } from '../fixtures/memory-extraction-cases.js';
import {
  parseRepeats,
  scoreCase,
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
