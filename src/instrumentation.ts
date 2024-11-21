import * as Sentry from '@sentry/nextjs';

const TARGET_ENV = process.env.TARGET_ENV;
const isProductionTarget = 'production';
const isStagingTarget = 'staging';

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

export const onRequestError = Sentry.captureException;
