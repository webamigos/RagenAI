'use server';

import type { z } from 'zod';

import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import {
  pageDecisionInputSchema,
  setAccessInputSchema,
  setOwnerInputSchema,
  type ReviewResult,
} from '@/features/brain/contracts/brain-review.types';
import { approveKnowledgePageCommand } from '@/features/brain/services/commands/approve-knowledge-page-command';
import { rejectKnowledgePageCommand } from '@/features/brain/services/commands/reject-knowledge-page-command';
import { setKnowledgePageAccessCommand } from '@/features/brain/services/commands/set-knowledge-page-access-command';
import { setKnowledgePageOwnerCommand } from '@/features/brain/services/commands/set-knowledge-page-owner-command';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';

/**
 * The review actions of Brain's panel (spec D2).
 *
 * Each one asks the same question the routes ask — `getBrainAccessQuery`:
 * an owner or admin of an organization with the flag on — and answers
 * `not-found` otherwise, as the routes answer 404, so an action cannot tell a
 * member more than the page could. The organization and the actor come from
 * the session, never from the request: the input names a page by `publicId`,
 * and the command looks it up inside that organization only.
 */

async function reviewer(): Promise<{ orgId: string; actorId: string } | null> {
  const access = await getBrainAccessQuery();
  if (!access) {
    return null;
  }
  const actorId = await getCurrentUserId();
  return actorId ? { orgId: access.orgId, actorId } : null;
}

async function run<T extends object>(
  schema: z.ZodType<T>,
  input: unknown,
  command: (
    input: T & { orgId: string; actorId: string },
  ) => Promise<ReviewResult>,
): Promise<ReviewResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'invalid-input' };
  }
  const who = await reviewer();
  if (!who) {
    return { success: false, error: 'not-found' };
  }
  return command({ ...parsed.data, ...who });
}

export async function approveKnowledgePageAction(
  input: unknown,
): Promise<ReviewResult> {
  return run(pageDecisionInputSchema, input, approveKnowledgePageCommand);
}

export async function rejectKnowledgePageAction(
  input: unknown,
): Promise<ReviewResult> {
  return run(pageDecisionInputSchema, input, rejectKnowledgePageCommand);
}

export async function setKnowledgePageOwnerAction(
  input: unknown,
): Promise<ReviewResult> {
  return run(setOwnerInputSchema, input, setKnowledgePageOwnerCommand);
}

export async function setKnowledgePageAccessAction(
  input: unknown,
): Promise<ReviewResult> {
  return run(setAccessInputSchema, input, setKnowledgePageAccessCommand);
}
