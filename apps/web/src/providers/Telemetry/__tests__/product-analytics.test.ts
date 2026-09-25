import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/app/lib/utils/logger';
import { readPublicRuntimeConfig } from '@/config/public-runtime-config';

import {
  DEFAULT_POSTHOG_HOST,
  initProductAnalytics,
  productAnalyticsConfig,
  productAnalyticsEnabled,
} from '../product-analytics';

/**
 * PostHog runs on the vendor's demo deployment and on nothing a customer
 * installs. These pin both halves of that: the two conditions, and that the
 * SDK is not even loaded when either is missing.
 */
function config(env: Record<string, string>) {
  return readPublicRuntimeConfig(env);
}

function fakeLoader() {
  const init = vi.fn();
  const load = vi.fn(async () => ({
    default: { init } as unknown as typeof import('posthog-js').default,
  }));
  return { init, load };
}

describe('productAnalyticsEnabled', () => {
  it('is on for the demo deployment with a key', () => {
    expect(
      productAnalyticsEnabled(
        config({ POSTHOG_KEY: 'phc_test', TARGET_ENV: 'demo' }),
      ),
    ).toBe(true);
  });

  it('is off for a self-hosted install, which has no key', () => {
    expect(productAnalyticsEnabled(config({ TARGET_ENV: 'production' }))).toBe(
      false,
    );
  });

  it('is off without a key even when the environment says demo', () => {
    // A self-hoster may name their own environment anything, "demo" included.
    expect(productAnalyticsEnabled(config({ TARGET_ENV: 'demo' }))).toBe(false);
  });

  it.each(['production', 'staging', 'local', ''])(
    'is off with a key outside demo (TARGET_ENV=%j)',
    (targetEnv) => {
      expect(
        productAnalyticsEnabled(
          config({ POSTHOG_KEY: 'phc_test', TARGET_ENV: targetEnv }),
        ),
      ).toBe(false);
    },
  );

  it('does not read a build-time NEXT_PUBLIC_ key', () => {
    // A NEXT_PUBLIC_ value is inlined into the image, which would ship the
    // vendor's key to every install.
    expect(
      config({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_test', TARGET_ENV: 'demo' })
        .posthogKey,
    ).toBe('');
  });
});

describe('initProductAnalytics', () => {
  it('never loads the SDK when disabled', async () => {
    const { init, load } = fakeLoader();

    await expect(
      initProductAnalytics(config({ TARGET_ENV: 'production' }), load),
    ).resolves.toBe(false);

    expect(load).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });

  it('starts PostHog with the key on demo', async () => {
    const { init, load } = fakeLoader();

    await expect(
      initProductAnalytics(
        config({ POSTHOG_KEY: 'phc_test', TARGET_ENV: 'demo' }),
        load,
      ),
    ).resolves.toBe(true);

    expect(init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: DEFAULT_POSTHOG_HOST }),
    );
  });

  it('swallows a failed chunk load instead of breaking the page', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const load = vi.fn(async () => {
      throw new Error('blocked by an ad blocker');
    });

    await expect(
      initProductAnalytics(
        config({ POSTHOG_KEY: 'phc_test', TARGET_ENV: 'demo' }),
        load,
      ),
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('productAnalyticsConfig', () => {
  it('defaults to the EU cloud and honours POSTHOG_HOST', () => {
    expect(productAnalyticsConfig({ posthogHost: '' }).api_host).toBe(
      'https://eu.i.posthog.com',
    );
    expect(
      productAnalyticsConfig({ posthogHost: 'https://ph.example' }).api_host,
    ).toBe('https://ph.example');
  });

  it('stores nothing on the device, keeps no person profile, and masks typed input', () => {
    expect(productAnalyticsConfig({ posthogHost: '' })).toMatchObject({
      persistence: 'memory',
      person_profiles: 'identified_only',
      session_recording: { maskAllInputs: true },
    });
  });

  it('does not use cookieless mode, which would switch session replay off', () => {
    // posthog-js refuses to start its session manager under
    // cookieless_mode 'always', and replay needs one.
    expect(productAnalyticsConfig({ posthogHost: '' })).not.toHaveProperty(
      'cookieless_mode',
    );
  });
});
