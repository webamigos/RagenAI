import * as Sentry from '@sentry/nextjs';

export const setSentryUserId = (userId: string) =>
  Sentry.setUser({ id: userId });

export const setSentrySessionTag = (sessionId: string) =>
  Sentry.setTag('session_id', sessionId);

export const setSentryServiceTag = (serviceName: string) =>
  Sentry.setTag('service', serviceName);

export const setSentryOrganizationTag = (orgId: string) =>
  Sentry.setTag('organization', orgId);

export const setSentryContext = (
  serviceName: string,
  functionName: string,
  payload: any
) => Sentry.setContext(`${serviceName}.${functionName}`, payload);
