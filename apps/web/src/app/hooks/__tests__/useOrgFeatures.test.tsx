import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import {
  DEFAULT_FEATURES,
  type FeatureFlags,
} from '@/features/subscriptions/contracts/features.types';
import { useOrgFeature, useOrgFeatures } from '../useOrgFeatures';

function withFeatures(features: FeatureFlags) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <OrgFeaturesProvider features={features}>{children}</OrgFeaturesProvider>
    );
  }
  return Wrapper;
}

describe('useOrgFeatures', () => {
  it('returns the flags the provider was given', () => {
    const features: FeatureFlags = { ...DEFAULT_FEATURES, voiceInput: true };

    const { result } = renderHook(() => useOrgFeatures(), {
      wrapper: withFeatures(features),
    });

    expect(result.current).toEqual(features);
  });

  it('falls back to code defaults outside a provider', () => {
    // A component rendered without the provider must not see an opt-in
    // feature as enabled — it would offer a control the server refuses.
    const { result } = renderHook(() => useOrgFeatures());

    expect(result.current).toEqual(DEFAULT_FEATURES);
    expect(result.current.voiceInput).toBe(false);
  });
});

describe('useOrgFeature', () => {
  it('reads a single flag', () => {
    const { result } = renderHook(() => useOrgFeature('voiceInput'), {
      wrapper: withFeatures({ ...DEFAULT_FEATURES, voiceInput: true }),
    });

    expect(result.current).toBe(true);
  });

  it('reports an opt-in flag as off when the provider says so', () => {
    const { result } = renderHook(() => useOrgFeature('voiceInput'), {
      wrapper: withFeatures({ ...DEFAULT_FEATURES, voiceInput: false }),
    });

    expect(result.current).toBe(false);
  });
});
