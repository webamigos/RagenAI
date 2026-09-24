import { describe, expect, it } from 'vitest';

import {
  ENCRYPTION_SEAM,
  STORAGE_SEAM,
  WORKER_RUNTIME_SEAM,
} from '@ragenai/env';

import {
  ENCRYPTION_LABELS,
  resolveEncryptionSelection,
  type EncryptionChoice,
} from '../../packages/create-ragen-app/src/encryption-provider';
import {
  resolveStorageSelection,
  STORAGE_LABELS,
  type StorageChoice,
} from '../../packages/create-ragen-app/src/storage-provider';
import {
  resolveWorkerRuntimeSelection,
  WORKER_RUNTIME_LABELS,
  type WorkerRuntimeChoice,
} from '../../packages/create-ragen-app/src/worker-runtime';

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

/**
 * `aliases` are answers the installer offers that are not variants of their
 * own, mapped to the variant they write. RustFS is the one: a store this
 * install starts, which the apps reach as plain `s3`. It is checked against
 * that variant like any other answer — the same required variables, the same
 * field names — and it is not allowed to be a variant the seam lacks, which
 * is what "offers no variant the seam does not have" would otherwise say
 * about it.
 */
const SEAMS = [
  {
    name: 'storage',
    seam: STORAGE_SEAM,
    labels: STORAGE_LABELS as Record<string, string>,
    aliases: { rustfs: 's3' } as Record<string, string>,
    // The installer offers the same variants the seam declares.
    select: (variant: string) =>
      resolveStorageSelection(variant as StorageChoice, {
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
    aliases: {} as Record<string, string>,
    select: (variant: string) =>
      resolveEncryptionSelection(variant as EncryptionChoice, {
        keyId: 'id',
        apiKey: 'key',
      }),
  },
  /**
   * The third seam the wizard answers, and the one where the required variable
   * is the whole point: since #1224 a producer with no `REDIS_URL` under BullMQ
   * refuses to boot, and the worker with no `TEMPORAL_SERVER_ADDRESS` under
   * Temporal connects to a `localhost:7233` that ADR-44 no longer starts. A
   * wizard that writes the runtime and not its address configures an install
   * that stops at startup — which is exactly what "writes every variable the
   * seam requires" is for.
   *
   * It writes no config fields: the runtime is environment only, and
   * `ragen.config.ts` has no group for it.
   */
  {
    name: 'worker runtime',
    seam: WORKER_RUNTIME_SEAM,
    labels: WORKER_RUNTIME_LABELS as Record<string, string>,
    aliases: {} as Record<string, string>,
    select: (variant: string) => ({
      ...resolveWorkerRuntimeSelection(variant as WorkerRuntimeChoice, {
        temporalServerAddress: 'temporal.internal:7233',
      }),
      configFields: [],
    }),
  },
] as const;

/** Every answer the installer offers, with the seam variant it writes. */
function answers(
  seam: (typeof SEAMS)[number]['seam'],
  aliases: Record<string, string>,
): Array<[answer: string, variant: string]> {
  return [
    ...Object.keys(seam.variants).map(
      (variant) => [variant, variant] as [string, string],
    ),
    ...Object.entries(aliases),
  ];
}

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
    ({ seam, labels, aliases }) => {
      // `none` is the installer's own: it means "write nothing", not a provider.
      // An alias is an answer the seam knows under another name.
      const declared = [
        ...Object.keys(seam.variants),
        'none',
        ...Object.keys(aliases),
      ];

      expect(Object.keys(labels).filter((v) => !declared.includes(v))).toEqual(
        [],
      );
    },
  );

  it.each(SEAMS)(
    'writes only variables the $name seam names',
    ({ seam, select, aliases }) => {
      for (const [answer, variant] of answers(seam, aliases)) {
        const spec = seam.variants[variant as keyof typeof seam.variants] as {
          required: readonly string[];
          optional?: readonly string[];
        };
        const known = [
          seam.discriminant,
          ...spec.required,
          ...(spec.optional ?? []),
        ];
        const { envUpdates } = select(answer);

        expect(
          Object.keys(envUpdates).filter((name) => !known.includes(name)),
          `${answer}: ${seam.discriminant}=${variant}`,
        ).toEqual([]);
        // An alias must write the variant it stands for, not its own name.
        expect(envUpdates[seam.discriminant], answer).toBe(variant);
      }
    },
  );

  it.each(SEAMS)(
    'writes every variable the $name seam requires',
    ({ seam, select, aliases }) => {
      // The one that matters most: a credential the seam made mandatory and
      // the wizard does not ask for produces an install that cannot boot.
      for (const [answer, variant] of answers(seam, aliases)) {
        const spec = seam.variants[variant as keyof typeof seam.variants] as {
          required: readonly string[];
        };
        const names = Object.keys(select(answer).envUpdates);

        expect(
          [...spec.required].filter((name) => !names.includes(name)),
          `${answer}: ${seam.discriminant}=${variant} is missing a required variable`,
        ).toEqual([]);
      }
    },
  );

  it.each(SEAMS)(
    'agrees with the $name seam on field names and requiredness',
    ({ seam, select, aliases }) => {
      for (const [answer, variant] of answers(seam, aliases)) {
        const spec = seam.variants[variant as keyof typeof seam.variants] as {
          required: readonly string[];
          fields?: Record<string, string>;
        };
        for (const { field, envVar, required } of select(answer).configFields) {
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
