import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().min(3, 'Please provide at least 3 characters'),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  title: z.string().min(6, 'Provide at least 6 characters'),
});

export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
