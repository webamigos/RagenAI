import { describe, expect, it } from 'vitest';

import { ENCRYPTION_SEAM, STORAGE_SEAM } from '@ragenai/env';

import {
  ENCRYPTION_LABELS,
  resolveEncryptionSelection,
  type EncryptionChoice,
} from '../../packages/create-ragen-app/src/encryption-provider';
import {
  resolveStorageSelection,
  STORAGE_LABELS,
} from '../../packages/create-ragen-app/src/storage-provider';

/**
 * `create-ragen-app` is published to npm and `@ragenai/env` is `private: true`,
 * so the installer cannot import the seam table — a dependency on it would make
 * `npm create ragen-app` unresolvable for every self-hoster. It therefore keeps
 * its own copy of the variable names, the config field names and which of them
 * are required, exactly as `manifest.ts` keeps its own copy of what lives in
 * `.env.example`.
 *
 * A copy nothing checks is the thing this repository keeps learning about, so
 * this test is the check. It is the only place the two descriptions meet: the
 * root test suite can import both, where neither package can import the other.
 *
 * What would go wrong without it: the installer writes an environment the app
 * then refuses to boot on — a variable renamed in the seam and not here, or a
 * newly required credential the wizard never asks for. Both surface on someone
 * else's first install, which is the worst place to find them.
 */

const SEAMS = [
  {
    name: 'storage',
    seam: STORAGE_SEAM,
    labels: STORAGE_LABELS as Record<string, string>,
    // The installer offers the same variants the seam declares.
    select: (variant: string) =>
      resolveStorageSelection(variant as 'local' | 's3', {
        bucket: 'b',
        region: 'r',
        endpoint: '',
        accessKeyId: 'k',
        secretAccessKey: 's',
      }),
  },
  {
    name: 'encryption',
    seam: ENCRYPTION_SEAM,
    labels: ENCRYPTION_LABELS as Record<string, string>,
    select: (variant: string) =>
      resolveEncryptionSelection(variant as EncryptionChoice, {
        keyId: 'id',
        apiKey: 'key',
      }),
  },
] as const;

describe('the installer knows the same provider seams', () => {
  it.each(SEAMS)('offers every $name variant', ({ seam, labels }) => {
    // A variant the seam supports and the wizard never offers is a provider a
    // self-hoster cannot choose without editing files by hand.
    const offered = Object.keys(labels);

    expect(
      Object.keys(seam.variants).filter((v) => !offered.includes(v)),
    ).toEqual([]);
  });

  it.each(SEAMS)(
    'offers no $name variant the seam does not have',
    ({ seam, labels }) => {
      // `none` is the installer's own: it means "write nothing", not a provider.
      const declared = [...Object.keys(seam.variants), 'none'];

      expect(Object.keys(labels).filter((v) => !declared.includes(v))).toEqual(
        [],
      );
    },
  );

  it.each(SEAMS)(
    'writes only variables the $name seam names',
    ({ seam, select }) => {
      for (const [variant, spec] of Object.entries(seam.variants)) {
        const known = [
          seam.discriminant,
          ...spec.required,
          ...(spec.optional ?? []),
        ];
        const written = Object.keys(select(variant).envUpdates);

        expect(
          written.filter((name) => !known.includes(name)),
          `${seam.discriminant}=${variant}`,
        ).toEqual([]);
      }
    },
  );

  it.each(SEAMS)(
    'writes every variable the $name seam requires',
    ({ seam, select }) => {
      // The one that matters most: a credential the seam made mandatory and
      // the wizard does not ask for produces an install that cannot boot.
      for (const [variant, spec] of Object.entries(seam.variants)) {
        const written = Object.keys(select(variant).envUpdates);

        expect(
          [...spec.required].filter((name) => !written.includes(name)),
          `${seam.discriminant}=${variant} is missing a required variable`,
        ).toEqual([]);
      }
    },
  );

  it.each(SEAMS)(
    'agrees with the $name seam on field names and requiredness',
    ({ seam, select }) => {
      for (const [variant, spec] of Object.entries(seam.variants)) {
        for (const { field, envVar, required } of select(variant)
          .configFields) {
          expect(
            spec.fields?.[envVar],
            `${envVar} is written as "${field}"`,
          ).toBe(field);

          expect(
            [...spec.required].includes(envVar),
            `${envVar} requiredness`,
          ).toBe(required);
        }
      }
    },
  );
});
