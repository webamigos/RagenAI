import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import * as fragments from '../fragments';
import { parseEnv } from '../parse';
import { seamRule } from '../provider-rules';
import {
  ENCRYPTION_SEAM,
  PROVIDER_SEAMS,
  STORAGE_SEAM,
  type ProviderSeam,
  type RequiredVarsOf,
} from '../provider-seams';

/**
 * The table is only worth having if it cannot drift from the schema it
 * describes. A variable misspelled here would be required of nobody — the
 * rule would compare against a key that does not exist, find it unset, and
 * report nothing, because `requiredForProvider` only fires for the chosen
 * variant's own list.
 */
const FRAGMENT_FOR_SEAM: readonly {
  seam: ProviderSeam;
  fragment: { shape: Record<string, unknown> };
  name: string;
}[] = [
  { seam: STORAGE_SEAM, fragment: fragments.storage, name: 'storage' },
  { seam: ENCRYPTION_SEAM, fragment: fragments.encryption, name: 'encryption' },
];

const varsNamedBy = (seam: ProviderSeam): string[] => [
  seam.discriminant,
  ...Object.values(seam.variants).flatMap((variant) => [
    ...variant.required,
    ...(variant.optional ?? []),
  ]),
];

describe('the seam table agrees with the fragments', () => {
  it.each(FRAGMENT_FOR_SEAM)(
    'every variable the $name seam names exists in the $name fragment',
    ({ seam, fragment }) => {
      const declared = Object.keys(fragment.shape);
      const unknown = varsNamedBy(seam).filter(
        (name) => !declared.includes(name),
      );

      expect(
        unknown,
        'a variable named in the seam but absent from the fragment is required of nobody — the rule looks up a key that is never parsed',
      ).toEqual([]);
    },
  );

  it.each(FRAGMENT_FOR_SEAM)(
    'the $name default variant is one of its variants',
    ({ seam }) => {
      if (seam.defaultVariant === undefined) {
        return;
      }
      expect(Object.keys(seam.variants)).toContain(seam.defaultVariant);
    },
  );

  it('names a default only where the fragment has one', () => {
    // STORAGE_PROVIDER defaults to 'local' in the fragment (ADR-27).
    // ENCRYPTION_PROVIDER deliberately has none: unset means @ragenai/crypto
    // auto-detects from whichever credentials are present, and naming a
    // variant here would contradict that.
    expect(STORAGE_SEAM.defaultVariant).toBe('local');
    expect(ENCRYPTION_SEAM).not.toHaveProperty('defaultVariant');
  });

  it('does not list a variable as both required and optional', () => {
    for (const seam of PROVIDER_SEAMS) {
      for (const [name, variant] of Object.entries(seam.variants)) {
        const optional = variant.optional ?? [];
        const both = variant.required.filter((v: string) =>
          optional.includes(v),
        );
        expect(both, `${seam.discriminant}=${name}`).toEqual([]);
      }
    }
  });
});

describe('seamRule generates the check the seam describes', () => {
  const seam = {
    discriminant: 'THING_PROVIDER',
    group: 'thing',
    label: 'Thing',
    variants: {
      cheap: { required: [], summary: 'needs nothing' },
      fancy: { required: ['FANCY_KEY', 'FANCY_REGION'], summary: 'needs two' },
    },
  } as const satisfies ProviderSeam;

  const schema = z
    .object({
      THING_PROVIDER: z.string().optional(),
      FANCY_KEY: z.string().optional(),
      FANCY_REGION: z.string().optional(),
    })
    .superRefine(seamRule(seam));

  it('asks for nothing when a variant requires nothing', () => {
    expect(parseEnv(schema, { THING_PROVIDER: 'cheap' }).ok).toBe(true);
  });

  it('asks for nothing when the discriminant is unset', () => {
    expect(parseEnv(schema, {}).ok).toBe(true);
  });

  it("reports a variant's whole list at once", () => {
    const result = parseEnv(schema, { THING_PROVIDER: 'fancy' });

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((i) => i.name)).toEqual(
      expect.arrayContaining(['FANCY_KEY', 'FANCY_REGION']),
    );
  });

  it("does not ask for one variant's variables under another", () => {
    expect(parseEnv(schema, { THING_PROVIDER: 'cheap' }).ok).toBe(true);
  });
});

describe('the table is usable as a type, not only as data', () => {
  it('narrows the required variables to the chosen variant', () => {
    // This is the property the installer's typed config needs: choosing 's3'
    // makes exactly these four mandatory, derived from the same table the
    // boot-time check reads rather than restated beside it.
    expectTypeOf<RequiredVarsOf<typeof STORAGE_SEAM, 's3'>>().toEqualTypeOf<
      | 'S3_BUCKET_NAME'
      | 'S3_REGION'
      | 'S3_ACCESS_KEY_ID'
      | 'S3_SECRET_ACCESS_KEY'
    >();

    expectTypeOf<RequiredVarsOf<typeof STORAGE_SEAM, 'local'>>().toBeNever();

    expectTypeOf<
      RequiredVarsOf<typeof ENCRYPTION_SEAM, 'kms'>
    >().toEqualTypeOf<'AWS_KMS_KEY_ID'>();
  });
});
