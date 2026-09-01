import { z } from 'zod';

export const piiPolicySchema = z
  .enum(['NONE', 'TOXIC_ONLY', 'STRICT'])
  .nullable()
  .optional();
