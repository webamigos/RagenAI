import {
  isThreadRetentionDays,
  type ThreadRetentionDays,
} from '@ragenai/platform-contracts';
import { z } from 'zod';

/**
 * What the panel may send to change the organization's thread retention:
 * one of the presets, or `null` to turn it off. Nothing else — a free number
 * is how `3` instead of `30` deletes almost everything (spec 2026-10-17, B4).
 *
 * No organization id: the command takes it from the session.
 */
export const threadRetentionInputSchema = z
  .object({
    threadRetentionDays: z
      .number()
      .refine(isThreadRetentionDays, {
        message: 'Choose one of the offered retention periods',
      })
      .nullable(),
  })
  .strict();

export type ThreadRetentionInput = {
  threadRetentionDays: ThreadRetentionDays | null;
};

/** Why a save was refused. Each has its own message in the panel. */
export type SaveThreadRetentionError =
  'invalid-period' | 'forbidden' | 'settings-locked' | 'save-failed';

export type SaveThreadRetentionResult =
  | { success: true; threadRetentionDays: ThreadRetentionDays | null }
  | { success: false; error: SaveThreadRetentionError };
