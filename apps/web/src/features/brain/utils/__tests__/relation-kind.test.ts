import { describe, expect, it } from 'vitest';

import en from '@/app/messages/en.json';
import pl from '@/app/messages/pl.json';

import {
  RELATION_KIND_KEYS,
  relationKindKey,
  relationKindLabel,
} from '../relation-kind';

const translator =
  (messages: { brain: { 'relation-kind': Record<string, string> } }) =>
  (key: string) =>
    messages.brain['relation-kind'][key.replace('relation-kind.', '')] ?? key;

describe('relationKindLabel', () => {
  it('translates the phrases the extraction prompt seeds', () => {
    expect(relationKindLabel('applies to', translator(pl))).toBe('dotyczy');
    expect(relationKindLabel('requires', translator(pl))).toBe('wymaga');
    expect(relationKindLabel('is part of', translator(pl))).toBe(
      'jest częścią',
    );
  });

  it('reads the model’s phrase however it was cased or spaced', () => {
    expect(relationKindKey('  Applies   To ')).toBe('applies-to');
    expect(relationKindKey('Responsible for')).toBe('is-responsible-for');
  });

  it('shows any other kind as written — a Polish document’s is already Polish', () => {
    expect(relationKindLabel('dotyczy', translator(pl))).toBe('dotyczy');
    expect(relationKindLabel('is audited by', translator(pl))).toBe(
      'is audited by',
    );
  });

  it('has every key translated in both locales it is checked against here', () => {
    for (const key of RELATION_KIND_KEYS) {
      expect(en.brain['relation-kind']).toHaveProperty(key);
      expect(pl.brain['relation-kind']).toHaveProperty(key);
    }
  });
});
