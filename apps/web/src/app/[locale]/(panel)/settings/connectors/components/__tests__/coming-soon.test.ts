/**
 * The teaser cards are a static list; the catalogue is not.
 *
 * Adding Notion as a row is exactly what the catalogue is for, and until this
 * filter the panel then showed two Notion cards: one offering to connect, one
 * saying the connector was coming.
 */
import { describe, expect, it } from 'vitest';

import { comingSoon } from '../ConnectorsList';
import type { PublicProviderDto } from '@/features/connectors/contracts/connector.types';

const provider = (slug: string) =>
  ({ provider: slug, name: slug }) as unknown as PublicProviderDto;

describe('comingSoon', () => {
  it('keeps every teaser while the catalogue carries none of them', () => {
    expect(comingSoon([provider('SLACK')]).map((t) => t.key)).toEqual([
      'BASELINKER',
      'KSEF',
      'NOTION',
    ]);
  });

  it('drops a teaser the catalogue now carries', () => {
    expect(comingSoon([provider('NOTION')]).map((t) => t.key)).toEqual([
      'BASELINKER',
      'KSEF',
    ]);
  });

  it('matches a slug an operator typed in their own case', () => {
    // The teaser keys are old enum members; an operator's slug is free-form.
    expect(comingSoon([provider('notion')]).map((t) => t.key)).toEqual([
      'BASELINKER',
      'KSEF',
    ]);
  });

  it('drops nothing for an unrelated catalogue entry', () => {
    expect(comingSoon([provider('open-mercato')])).toHaveLength(3);
  });
});
