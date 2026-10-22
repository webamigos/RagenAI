import { z } from 'zod';

import {
  INSTANCE_PALETTES,
  PRODUCT_NAME_MAX_LENGTH,
} from '@ragenai/platform-contracts';

/**
 * A product name: trimmed, at most {@link PRODUCT_NAME_MAX_LENGTH}
 * characters, and empty meaning "use the default". React escapes it wherever
 * it is rendered, so markup is harmless; control characters are refused
 * because they would end up in page titles and email subjects.
 */
export const productNameSchema = z
  .string()
  .trim()
  .max(PRODUCT_NAME_MAX_LENGTH, {
    message: `The product name can be at most ${PRODUCT_NAME_MAX_LENGTH} characters.`,
  })
  // eslint-disable-next-line no-control-regex -- the point is to find them
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: 'The product name cannot contain control characters.',
  })
  .transform((value) => (value === '' ? null : value));

/**
 * The text half of a branding save. A multipart form sends every value as a
 * string, so `removeLogo` accepts the two strings a checkbox can produce.
 */
export const instanceBrandingInputSchema = z.object({
  productName: productNameSchema,
  palette: z.enum(INSTANCE_PALETTES, {
    message: 'Pick one of the listed palettes.',
  }),
  removeLogo: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export type InstanceBrandingInput = z.infer<typeof instanceBrandingInputSchema>;
