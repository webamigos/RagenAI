import { registerWelcomeEmailSubscriber } from './welcome-email';
import { registerNewsletterSignupSubscriber } from './newsletter-signup';

let subscribersRegistered = false;

/**
 * Wires every server-side event subscriber Ragen ships. Called once at
 * application startup from `instrumentation.ts`.
 *
 * Each subscriber is responsible for its own gating (env vars, feature
 * flags). A subscriber may return `null` to opt out at registration
 * time — for example, newsletter signup skips itself when the target
 * segment id is not configured.
 *
 * Idempotent: only the first call attaches listeners. Dev HMR reloads
 * or an accidental second call cannot double-register.
 */
export function registerAllSubscribers(): void {
  if (subscribersRegistered) {
    return;
  }
  subscribersRegistered = true;
  registerWelcomeEmailSubscriber();
  registerNewsletterSignupSubscriber();
}
