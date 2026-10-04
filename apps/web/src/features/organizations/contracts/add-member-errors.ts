/**
 * Why adding someone to an organization was refused.
 *
 * `canAddMemberQuery` and `createMemberAccountCommand` used to return Polish and
 * English sentences, which two actions passed on and the dialog rendered as they
 * were (#1092). They return a **code** now, the same way the organization-profile
 * actions do, and the component turns it into the reader's language: the query
 * decides what was refused, never what language to say it in.
 *
 * Lives in the feature, not in the route that happens to show it: the route
 * imports this, which is the direction dependencies run in.
 */
export const ADD_MEMBER_ERROR_CODES = [
  'no-permission-add-member',
  'plan-required-for-members',
  'member-limit-reached',
  'already-member',
  'account-exists-use-invitation',
  'invitation-pending-cancel-first',
  'create-account-failed',
] as const;

export type AddMemberErrorCode = (typeof ADD_MEMBER_ERROR_CODES)[number];

/** Values for the ICU placeholders in a code's message, e.g. `{ limit: 5 }`. */
export type ErrorParams = Record<string, string | number>;

export type AddMemberRefusal = {
  code: AddMemberErrorCode;
  params?: ErrorParams;
};
