import { z } from 'zod';

export const createThreadSchema = z.object({
  public_id: z.uuid(),
  project_id: z.number().optional(),
});

export type CreateThreadDto = z.infer<typeof createThreadSchema>;
