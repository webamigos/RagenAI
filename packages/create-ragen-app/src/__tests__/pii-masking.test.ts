import { describe, expect, it } from 'vitest';

import {
  PII_COMPOSE_PROFILE,
  resolvePiiMaskingSelection,
} from '../pii-masking';

/**
 * Off unless asked for, and "off" has to mean writing nothing.
 *
 * Availability follows the two Presidio URLs rather than a flag, so declining
 * cannot leave an "enabled but unconfigured" state behind — there is no flag
 * to leave set. Presidio is also the stack's largest memory consumer (959 MB
 * idle for the analyzer alone), which is why the default matters at all.
 */
describe('resolvePiiMaskingSelection', () => {
  it('writes nothing and starts nothing when declined', () => {
    const selection = resolvePiiMaskingSelection(false);

    expect(selection.enabled).toBe(false);
    expect(selection.envUpdates).toEqual({});
    expect(selection.composeProfiles).toEqual([]);
  });

  it('writes both urls when accepted — one of them alone masks nothing', () => {
    const selection = resolvePiiMaskingSelection(true);

    expect(Object.keys(selection.envUpdates).sort()).toEqual([
      'PRESIDIO_ANALYZER_URL',
      'PRESIDIO_ANONYMIZER_URL',
    ]);
  });

  /**
   * The half that would otherwise be missed: the services sit behind a compose
   * profile, so writing the urls without starting them points the app at
   * containers nobody ran.
   */
  it('asks compose for the profile those services sit behind', () => {
    expect(resolvePiiMaskingSelection(true).composeProfiles).toEqual([
      PII_COMPOSE_PROFILE,
    ]);
    expect(PII_COMPOSE_PROFILE).toBe('pii');
  });
});
