import { describe, expect, it } from 'vitest';

import {
  ENCRYPTION_SEAM,
  STORAGE_SEAM,
  BULLMQ_BACKEND_SEAM,
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
 * A seam with no second level. Spelled out rather than left optional so every
 * entry has the same shape, and so adding a nested seam to another one is a
 * deliberate edit here rather than a silently absent field.
 */
const NOT_NESTED = null;

type Nesting = {
  /** The parent variant the nested seam applies under. */
  readonly under: string;
  /** The nested variant the installer writes while it asks no question. */
  readonly variant: string;
  readonly seam: ProviderSeam;
} | null;

/** What the nested seam contributes to a parent variant, if anything. */
const nestedVars = (
  nesting: Nesting,
  parentVariant: string,
): { known: readonly string[]; required: readonly string[] } => {
  if (!nesting || nesting.under !== parentVariant) {
    return { known: [], required: [] };
  }
  const spec = nesting.seam.variants[nesting.variant];
  return {
    known: [
      nesting.seam.discriminant,
      ...spec.required,
      ...(spec.optional ?? []),
    ],
    required: spec.required,
  };
};

const SEAMS = [
  {
    name: 'storage',
    seam: STORAGE_SEAM,
    nested: NOT_NESTED,
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
    nested: NOT_NESTED,
    labels: ENCRYPTION_LABELS as Record<string, string>,
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
    /**
     * The one seam with a second level, and the installer still asks one
     * question about both.
     *
     * `BULLMQ_BACKEND` decides whether the queues live in Redis or in
     * PostgreSQL, so `REDIS_URL` belongs to that seam rather than to this one.
     * The wizard does not ask yet: choosing BullMQ writes the Redis url,
     * which is the default backend's requirement and therefore a correct
     * install. Until it asks, the variables it may write are this seam's plus
     * the nested default's — and the requirement below stays as strong as it
     * was, which is the half that would otherwise quietly stop being checked.
     */
    nested: {
      under: 'bullmq',
      variant: 'redis',
      seam: BULLMQ_BACKEND_SEAM,
    },
    labels: WORKER_RUNTIME_LABELS as Record<string, string>,
    select: (variant: string) => ({
      ...resolveWorkerRuntimeSelection(variant as WorkerRuntimeChoice, {
        temporalServerAddress: 'temporal.internal:7233',
      }),
      configFields: [],
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
    ({ seam, select, nested }) => {
      for (const [variant, spec] of Object.entries(seam.variants)) {
        const known = [
          seam.discriminant,
          ...spec.required,
          ...(spec.optional ?? []),
          ...nestedVars(nested, variant).known,
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
    ({ seam, select, nested }) => {
      // The one that matters most: a credential the seam made mandatory and
      // the wizard does not ask for produces an install that cannot boot.
      //
      // The nested seam's requirements count as this seam's while the wizard
      // asks one question about both. Without that, moving `REDIS_URL` down a
      // level would have taken it out of this check silently — the wizard
      // would still write it, nothing would say it had to, and the day it
      // stopped would be someone else's first install.
      for (const [variant, spec] of Object.entries(seam.variants)) {
        const written = Object.keys(select(variant).envUpdates);
        const required = [
          ...spec.required,
          ...nestedVars(nested, variant).required,
        ];

        expect(
          required.filter((name) => !written.includes(name)),
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
