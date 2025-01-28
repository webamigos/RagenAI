import { z } from 'zod';

export const updateThreadSchema = z.object({
  title: z.string().min(6, 'Provide at least 6 characters'),
});

export type UpdateThreadDto = z.infer<typeof updateThreadSchema>;
