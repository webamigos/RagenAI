import { describe, expect, it } from 'vitest';
import {
  PROVIDER_ICON_PATHS,
  iconPathForProvider,
  providerFromToolName,
} from '../provider-icons';

describe('providerFromToolName', () => {
  it('extracts the provider slug from a prefixed tool name', () => {
    expect(providerFromToolName('rejestrio__lookup_company')).toBe('REJESTRIO');
    expect(providerFromToolName('google_calendar__gcal_create_event')).toBe(
      'GOOGLE_CALENDAR',
    );
    expect(providerFromToolName('clickup__clickup_search')).toBe('CLICKUP');
  });

  it('returns null for a tool name with no prefix', () => {
    expect(providerFromToolName('standalone_tool')).toBeNull();
  });

  it('returns null for an unknown provider (type guard)', () => {
    expect(providerFromToolName('madeup__whatever')).toBeNull();
  });

  it('handles empty input defensively', () => {
    expect(providerFromToolName('')).toBeNull();
  });
});

describe('iconPathForProvider', () => {
  it('returns the SVG path for a known provider', () => {
    expect(iconPathForProvider('REJESTRIO')).toBe(
      '/assets/connectors/rejestrio.svg',
    );
  });

  it('returns null for unknown or null input', () => {
    expect(iconPathForProvider(null)).toBeNull();
    expect(iconPathForProvider('NOPE')).toBeNull();
  });
});

describe('PROVIDER_ICON_PATHS coverage', () => {
  it('has an entry for every known connector including Rejestrio', () => {
    // Sanity check — a new connector author should extend this map.
    expect(PROVIDER_ICON_PATHS.REJESTRIO).toBeTruthy();
    expect(PROVIDER_ICON_PATHS.GOOGLE_CALENDAR).toBeTruthy();
    expect(PROVIDER_ICON_PATHS.CLICKUP).toBeTruthy();
  });
});
