import { z } from 'zod';

export const threadSchema = z.object({
  public_id: z.string().uuid(),
});

export type ThreadDto = z.infer<typeof threadSchema>;
