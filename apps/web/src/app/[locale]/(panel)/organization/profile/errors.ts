/**
 * What the organization-profile server actions say when they refuse.
 *
 * The actions used to return Polish sentences, which the UI rendered as they
 * were, so an English user who lacked a permission read "Nie masz uprawnień do
 * wysyłania zaproszeń" (#1092). They return a **code** now and the component
 * turns it into the reader's language: an action decides *what* went wrong, the
 * client decides how to say it, and a Server Action has no business choosing a
 * language for a person it is not looking at.
 *
 * Not a `'use server'` file, because it exports values; a Server Action module
 * may export only async functions.
 *
 * Every code has a message under `organization.errors` in every locale, which
 * `__tests__/errors.test.ts` checks, since the lookup is dynamic and the
 * translation-key guard cannot see it.
 */
import {
  ADD_MEMBER_ERROR_CODES,
  type AddMemberErrorCode,
  type ErrorParams,
} from '@/features/organizations/contracts/add-member-errors';

export const ORG_PROFILE_ERROR_CODES = [
  // Why adding a member was refused, from the feature that decides it.
  ...ADD_MEMBER_ERROR_CODES,
  'invalid-data',
  // invitations
  'invitation-not-found',
  'no-permission-cancel-invitation',
  'cancel-invitation-failed',
  'no-permission-send-invitation',
  'send-invitation-failed',
  'resend-invitation-failed',
  'invitation-already-sent',
  // members
  'invite-member-failed',
  'no-permission-remove-member',
  'member-not-found',
  'cannot-remove-self',
  'cannot-remove-owner',
  'remove-member-failed',
  'no-permission-change-role',
  'cannot-change-owner-role',
  'change-role-failed',
  // the organization itself
  'no-permission-edit-organization',
  'update-organization-failed',
] as const;

export type OrgProfileErrorCode =
  AddMemberErrorCode | (typeof ORG_PROFILE_ERROR_CODES)[number];

/** A refusal. The actions' failure shape, with a code in place of prose. */
export const failure = (code: OrgProfileErrorCode, params?: ErrorParams) =>
  (params ? { success: false, code, params } : { success: false, code }) as
    | { readonly success: false; readonly code: OrgProfileErrorCode }
    | {
        readonly success: false;
        readonly code: OrgProfileErrorCode;
        readonly params: ErrorParams;
      };

/** What an action's result may carry when it did not succeed. */
export type ActionFailure = {
  /**
   * Present so a result that only says `success` is still a valid argument:
   * a function that returns `{ success: true }` on one path infers
   * `{ success: boolean }`, which shares no property with the others, and a
   * type whose properties are all optional rejects a value it has nothing in
   * common with.
   */
  success?: boolean;
  /** A code from this file. */
  code?: OrgProfileErrorCode;
  /** Values for the placeholders in the code's message, e.g. `{ limit: 5 }`. */
  params?: ErrorParams;
  /**
   * Prose from a shared check (the add-member gate and the account command),
   * which still returns sentences of its own. Shown as it is; moving those to
   * codes is a separate change.
   */
  error?: string;
};

/**
 * The message to show for a failed result.
 *
 * `tErrors` is `useTranslations('organization.errors')`; `fallback` is the
 * component's own generic message for a result with neither a code nor text.
 */
export function actionErrorMessage(
  tErrors: (code: OrgProfileErrorCode, values?: ErrorParams) => string,
  result: ActionFailure,
  fallback: string,
): string {
  if (result.code) {
    return tErrors(result.code, result.params);
  }

  return result.error || fallback;
}
