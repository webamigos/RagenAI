import { z } from 'zod';

export const createThreadSchema = z.object({
  public_id: z.string().uuid(),
});

export type CreateThreadDto = z.infer<typeof createThreadSchema>;
