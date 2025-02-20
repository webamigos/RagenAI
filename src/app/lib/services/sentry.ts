import * as Sentry from '@sentry/nextjs';

export const SentryTag = {
  CLERK_SESSION_ID: 'clerk_session_id',
  CLERK_ORGANIZATION_ID: 'clerk_organization_id',
  CLERK_USER_ID: 'clerk_user_id',
  APP_SERVICE: 'app_service',
};

export const SentryContext = {
  CLERK: 'Clerk',
  THREAD_ID: 'ThreadId',
  EXTRA_DATA: 'ExtraData',
  CHAIN_DATA: 'ChainData',
  CHAIN_SSE_ERROR: 'ChainSseError',
};

type SentryContextKey = keyof typeof SentryContext;

export const setSentryUserId = (userId: string) =>
  Sentry.setUser({ id: userId });

export const setSentryClerkSessionTag = (sessionId: string) =>
  Sentry.setTag(SentryTag.CLERK_SESSION_ID, sessionId);

export const setSentryClerkOrganizationTag = (orgId: string) =>
  Sentry.setTag(SentryTag.CLERK_ORGANIZATION_ID, orgId);

export const setSentryClerkUserTag = (userId: string) =>
  Sentry.setTag(SentryTag.CLERK_USER_ID, userId);

export const setSentryServiceTag = (serviceName: string) =>
  Sentry.setTag(SentryTag.APP_SERVICE, serviceName);

export const setSentryContext = (name: SentryContextKey, payload: any) =>
  Sentry.setContext(SentryContext[name], payload);

type SentryContextPayload = {
  sessionId?: string; // may come from API
  orgId: string;
  userId: string;
};

export const setSentryClerkContext = (payload: SentryContextPayload) =>
  Sentry.setContext(SentryContext.CLERK, payload);

export const setSentryTagsAndContextForClerk = (
  payload: SentryContextPayload
) => {
  const { sessionId, orgId, userId } = payload;
  setSentryUserId(userId);
  setSentryClerkOrganizationTag(orgId);
  setSentryClerkUserTag(userId);
  if (sessionId) {
    setSentryClerkSessionTag(sessionId);
  }
  setSentryClerkContext({
    sessionId,
    orgId,
    userId,
  });
};
