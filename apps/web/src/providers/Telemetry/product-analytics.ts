import type { PostHogConfig } from 'posthog-js';

import { logger } from '@/app/lib/utils/logger';
import {
  publicRuntimeConfig,
  type PublicRuntimeConfig,
} from '@/config/public-runtime-config';

/**
 * Product analytics (PostHog) on the vendor's demo deployment, and nowhere
 * else.
 *
 * `apps/web` is the application a customer self-hosts, and the rule in
 * `docs/lessons/a-hardcoded-analytics-id-tracks-every-self-hoster.md` is that
 * it measures nobody unless the deployment itself asks to. This is the one
 * exception, and it holds only while **both** conditions do:
 *
 * - `POSTHOG_KEY` is set. It lives in the demo service's environment on
 *   Railway and in no file in this repository, so a self-hosted install has no
 *   key to find. This is the condition that actually protects a self-hoster —
 *   an environment tier cannot say "this is the vendor's own deployment", a
 *   key the vendor holds can.
 * - `TARGET_ENV` is `demo`. A key copied into another environment by mistake
 *   still measures nothing. The demo spec lists telemetry among the things
 *   `TARGET_ENV=demo` may describe.
 *
 * `posthog-js` is imported dynamically so that the SDK is a separate chunk the
 * browser fetches only when both hold: on any other deployment it is never
 * downloaded, and no request leaves for PostHog.
 * `tests/architecture/analytics-ids-are-not-hardcoded.test.ts` keeps this the
 * only file that imports it.
 */

/** PostHog's EU cloud. The demo is an EU deployment, so its visitors' events stay there. */
export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

export function productAnalyticsEnabled(
  config: Pick<PublicRuntimeConfig, 'posthogKey' | 'targetEnv'>,
): boolean {
  return config.posthogKey !== '' && config.targetEnv === 'demo';
}

/**
 * What the SDK is started with.
 *
 * - `cookieless_mode: 'always'`: no cookies and no local storage, so the demo
 *   needs no consent banner. PostHog ignores these events unless cookieless
 *   mode is also switched on in the project's settings.
 * - `person_profiles: 'identified_only'` and no `identify()` call: the demo is
 *   one shared account, so a person profile would describe every visitor at
 *   once.
 * - `maskAllInputs`: session replay never records what a visitor types into
 *   the chat box, which is the one place they might type something personal.
 */
export function productAnalyticsConfig(
  config: Pick<PublicRuntimeConfig, 'posthogHost'>,
): Partial<PostHogConfig> {
  return {
    api_host: config.posthogHost || DEFAULT_POSTHOG_HOST,
    defaults: '2026-08-30',
    cookieless_mode: 'always',
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    session_recording: { maskAllInputs: true },
  };
}

type PostHogModule = Pick<typeof import('posthog-js'), 'default'>;

export async function initProductAnalytics(
  config: PublicRuntimeConfig = publicRuntimeConfig(),
  load: () => Promise<PostHogModule> = () => import('posthog-js'),
): Promise<boolean> {
  if (!productAnalyticsEnabled(config)) {
    return false;
  }

  try {
    const { default: posthog } = await load();
    posthog.init(config.posthogKey, productAnalyticsConfig(config));
    return true;
  } catch (error) {
    // Analytics must never take the page with it: a blocked chunk or an ad
    // blocker is an ordinary visitor, not an error worth surfacing.
    logger.warn({ err: error }, 'PostHog did not start');
    return false;
  }
}
