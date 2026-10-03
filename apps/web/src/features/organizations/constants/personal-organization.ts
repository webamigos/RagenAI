/**
 * The slug of the organization the `user.create.after` hook in `auth.ts`
 * creates for a new account.
 *
 * It is the only stable handle on "the organization this user got at sign-up":
 * a user can own several organizations, and code that means the sign-up one
 * has to name it rather than take whichever owner membership comes first.
 * The hook writes it and readers look it up through this one function, so the
 * two cannot drift apart.
 */
export function personalOrganizationSlug(userId: string): string {
  return `${userId}-org`;
}
