const TARGET_ENV = process.env.TARGET_ENV;
const isProductionTarget = TARGET_ENV === 'production';
const isStagingTarget = TARGET_ENV === 'staging';

export async function register() {
  if (!(isProductionTarget || isStagingTarget)) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

/**
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/
 *
 *
 * BELOW LINE WORKS ONLY WITH NEXT 15 AND SENTRY 8!
 *
 * Nested React Server Components
 * Prior to Next.js version 15, errors thrown in nested React Server Components were not exposed by the framework, preventing the SDK from capturing them.
 * Next.js 15 introduced an onRequestError hook in instrumentation.ts that allows capturing and reporting these errors.
 * Refer to Capturing Errors From Nested React Server Components for detailed setup instructions.
 */
// export const onRequestError = Sentry.captureRequestError;
