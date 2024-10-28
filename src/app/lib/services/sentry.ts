import * as Sentry from '@sentry/nextjs';

// DO NOT USE below const in logger.ts
// Otherwise pino doesn't logs anything 🤦
const SentryTag = {
  CLERK_SESSION_ID: 'clerk_session_id',
  CLERK_ORGANIZATION_ID: 'clerk_organization_id',
  CLERK_USER_ID: 'clerk_user_id',
  APP_SERVICE: 'app_service',
};

const SentryContext = {
  CLERK: 'clerk',
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
  sessionId: string;
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
  setSentryClerkSessionTag(sessionId);
  setSentryClerkOrganizationTag(orgId);
  setSentryClerkUserTag(userId);
  setSentryClerkContext({
    sessionId,
    orgId,
    userId,
  });
};
