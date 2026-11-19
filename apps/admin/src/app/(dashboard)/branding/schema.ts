import { z } from 'zod';
import {
  INSTANCE_PALETTES,
  PRODUCT_NAME_MAX_LENGTH,
} from '@ragenai/platform-contracts';

/**
 * The panel's early check on the text half of a branding save, so an
 * operator hears about a long name before a logo is uploaded with it.
 *
 * apps/web validates again and is the gate (`branding.schemas.ts` there); the
 * shared constants are what keep the two from disagreeing about what is
 * allowed.
 */
export const brandingFormSchema = z.object({
  productName: z
    .string()
    .trim()
    .max(PRODUCT_NAME_MAX_LENGTH, {
      message: `The product name can be at most ${PRODUCT_NAME_MAX_LENGTH} characters.`,
    }),
  palette: z.enum(INSTANCE_PALETTES, {
    message: 'Pick one of the listed palettes.',
  }),
  removeLogo: z.boolean(),
});

export type BrandingForm = z.infer<typeof brandingFormSchema>;

/** A form's fields as the schema reads them. */
export function readBrandingForm(form: FormData) {
  return brandingFormSchema.safeParse({
    productName: String(form.get('productName') ?? ''),
    palette: form.get('palette'),
    removeLogo: form.get('removeLogo') === 'true',
  });
}
