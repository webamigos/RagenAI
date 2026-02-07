import { auth } from '@clerk/nextjs/server';
import { getOrgIdFromAuthOrThrow } from '../utils/auth-helpers';

/**
 * @deprecated Use getOrgIdFromAuthOrThrow from auth-helpers instead.
 * This helper is kept for backward compatibility but redirects to the new
 * multi-strategy implementation that handles Next.js 15 + Clerk v6 issues.
 */
export const getOrgIdOrThrow = async () => {
  return getOrgIdFromAuthOrThrow();
};
