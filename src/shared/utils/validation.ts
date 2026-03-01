import type { z } from 'zod';
import type { OperationResult } from '@/types/common';

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
):
  | { success: true; data: T }
  | { success: false; result: OperationResult<never> } {
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    return {
      success: false,
      result: {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      },
    };
  }

  return { success: true, data: parsed.data };
}
