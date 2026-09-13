import {
  FIELD_GROUPS,
  type DATABASE_GROUP,
  type FieldGroup,
  type GATEWAY_GROUP,
  type MODELS_GROUP,
  type OBSERVABILITY_GROUP,
  type TOKEN_VAULT_GROUP,
  type VECTOR_STORE_GROUP,
} from './config-groups';
import {
  type ENCRYPTION_SEAM,
  PROVIDER_SEAMS,
  type STORAGE_SEAM,
  type ProviderSeam,
  type VariantOf,
} from './provider-seams';

/**
 * A typed façade for the choices a deployment makes.
 *
 * ADR-37 declined a `ragen.config.ts` that the apps would *read*, and that
 * still stands: a file in git is the wrong home for a secret, and compose,
 * the Dockerfiles and Railway only speak environment variables. This is the
 * other thing — a file the installer **writes**, which is ADR-37's own second
 * revisit trigger ("if `features/setup` grows into a wizard, a written
 * configuration file becomes the thing the wizard writes").
 *
 * What it buys, and the reason it exists: choosing a provider makes that
 * provider's variables mandatory *in the editor*. `storage: { provider: 's3' }`
 * with no bucket does not typecheck. Until now the same fact was only enforced
 * at boot, and only in the apps that remembered to pair the rule.
 *
 * Every shape below is derived from `provider-seams.ts` — the same table the
 * boot-time check reads. Nothing here restates which variable a provider
 * needs, because restating it is what let the documentation drift from the
 * code (see the review of #1114).
 *
 * **Values still come from the environment.** A field holds an expression over
 * `process.env`, not a literal secret:
 *
 * ```ts
 * export default defineConfig({
 *   storage: {
 *     provider: 's3',
 *     bucketName: process.env.S3_BUCKET_NAME!,
 *     region: process.env.S3_REGION ?? 'fr-par',
 *     accessKeyId: process.env.S3_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
 *     endpoint: process.env.S3_ENDPOINT_URL,
 *   },
 * });
 * ```
 *
 * The file carries the structure and the defaulting; the deployment carries
 * the values. That keeps one source of truth rather than adding a second, and
 * it gives the defaulting logic a home — today it is scattered across
 * `@ragenai/storage`'s provider, which computes its own endpoint.
 */

/** The `fields` map of one variant, or `{}` when it declares none. */
type FieldsOf<
  S extends ProviderSeam,
  V extends VariantOf<S>,
> = S['variants'][V] extends { readonly fields: infer F }
  ? F
  : Record<never, never>;

type RequiredVarsOfVariant<
  S extends ProviderSeam,
  V extends VariantOf<S>,
> = S['variants'][V] extends { readonly required: readonly (infer N)[] }
  ? N
  : never;

type OptionalVarsOfVariant<
  S extends ProviderSeam,
  V extends VariantOf<S>,
> = S['variants'][V] extends { readonly optional: readonly (infer N)[] }
  ? N
  : never;

/**
 * Env-var names remapped to their config field names.
 *
 * The `as` clause is the whole trick: it renames each key through the seam's
 * own `fields` map, so `S3_BUCKET_NAME` in the table becomes `bucketName` in
 * the config type without the mapping being written twice.
 */
type FieldsFromVars<S extends ProviderSeam, V extends VariantOf<S>, Vars> = {
  [E in Vars & keyof FieldsOf<S, V> as FieldsOf<S, V>[E] & string]: string;
};

/** Every field name any variant of a seam uses. */
type AnyFieldOf<S extends ProviderSeam> = {
  [V in VariantOf<S>]: FieldsOf<S, V>[keyof FieldsOf<S, V>];
}[VariantOf<S>] &
  string;

/** The field names one variant uses. */
type OwnFieldOf<S extends ProviderSeam, V extends VariantOf<S>> = FieldsOf<
  S,
  V
>[keyof FieldsOf<S, V>] &
  string;

/**
 * Fields that belong to a *different* variant, typed as never so supplying one
 * is an error.
 *
 * Without this, `{ provider: 'kms', masterKey: 'k' }` typechecks: excess
 * property checking against a union accepts any property present in some
 * member, and `masterKey` is a real field of the `local` variant. Naming a
 * Scaleway key under KMS is exactly the confusion this file exists to prevent,
 * so it is worth the extra type.
 */
type ForbidOtherFields<S extends ProviderSeam, V extends VariantOf<S>> = {
  [K in Exclude<AnyFieldOf<S>, OwnFieldOf<S, V>>]?: never;
};

/**
 * One group of the config — `storage`, `encryption` — as a discriminated
 * union over its variants. This is what makes an incomplete choice a type
 * error rather than a boot failure.
 */
export type GroupConfig<S extends ProviderSeam> = {
  [V in VariantOf<S>]: { provider: V } & FieldsFromVars<
    S,
    V,
    RequiredVarsOfVariant<S, V>
  > &
    Partial<FieldsFromVars<S, V, OptionalVarsOfVariant<S, V>>> &
    ForbidOtherFields<S, V>;
}[VariantOf<S>];

/**
 * A group with no discriminant: its fields do not depend on a choice.
 *
 * Required entries are required; optional ones are optional. There is no
 * conditional narrowing to do, which is exactly why these are described
 * separately from the seams rather than being modelled as a seam with one
 * variant.
 */
export type FlatConfig<G extends FieldGroup> = {
  [
    E in G['required'][number] as G['fields'][E & keyof G['fields']] & string
  ]: string;
} & Partial<{
  [
    E in NonNullable<G['optional']>[number] as G['fields'][E &
      keyof G['fields']] &
      string
  ]: string;
}>;

export type RagenConfig = {
  storage?: GroupConfig<typeof STORAGE_SEAM>;
  encryption?: GroupConfig<typeof ENCRYPTION_SEAM>;
  database?: FlatConfig<typeof DATABASE_GROUP>;
  gateway?: FlatConfig<typeof GATEWAY_GROUP>;
  vectorStore?: FlatConfig<typeof VECTOR_STORE_GROUP>;
  models?: FlatConfig<typeof MODELS_GROUP>;
  observability?: FlatConfig<typeof OBSERVABILITY_GROUP>;
  tokenVault?: FlatConfig<typeof TOKEN_VAULT_GROUP>;
};

/**
 * Identity at runtime, and the point at compile time.
 *
 * `const C` preserves the literal provider so the union narrows to the chosen
 * variant rather than widening to `string` — without it, `provider: 's3'`
 * infers as `string` and no requirement applies.
 */
export function defineConfig<const C extends RagenConfig>(config: C): C {
  return config;
}

const SEAM_BY_GROUP: Record<string, ProviderSeam> = Object.fromEntries(
  PROVIDER_SEAMS.map((seam) => [seam.group, seam]),
);

const FIELD_GROUP_BY_GROUP: Record<string, FieldGroup> = Object.fromEntries(
  FIELD_GROUPS.map((group) => [group.group, group]),
);

/** The config field names a group's required variables are carried by. */
const requiredFieldsOf = (
  fields: Readonly<Record<string, string>> | undefined,
  required: readonly string[] | undefined,
): string[] =>
  (required ?? [])
    .map((name) => fields?.[name])
    .filter((field): field is string => field !== undefined);

/** field name -> environment variable, for one group's `fields` map. */
const reverse = (fields: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [field, name]),
  );

/**
 * The environment a config describes: `{ S3_BUCKET_NAME: '…', … }`.
 *
 * This is what the installer writes to `.env`, and it is the reason the
 * `fields` mapping is data rather than convention — the same table drives the
 * type going in and the variable names coming out, so a config that
 * typechecks cannot produce an environment the boot-time check rejects for a
 * missing variable.
 *
 * A field set to `undefined` is omitted rather than written blank: a blank
 * variable means unset (see `blankAsUndefined`), so writing `S3_ENDPOINT_URL=`
 * would say something the schema then has to undo.
 */
export function configToEnv(config: RagenConfig): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [group, chosen] of Object.entries(config)) {
    if (!chosen) {
      continue;
    }

    const seam = SEAM_BY_GROUP[group];
    const flat = FIELD_GROUP_BY_GROUP[group];

    if (seam) {
      const { provider, ...fields } = chosen as {
        provider: string;
      } & Record<string, unknown>;

      env[seam.discriminant] = provider;
      const variant = seam.variants[provider];
      write(
        env,
        reverse(variant?.fields ?? {}),
        fields,
        `${seam.label} (${provider})`,
        requiredFieldsOf(variant?.fields, variant?.required),
      );
      continue;
    }

    if (!flat) {
      // Same gap as an unknown field, one level up: `defineConfig` infers a
      // generic `C extends RagenConfig`, and TypeScript does not apply
      // excess-property checking to a literal inferred as a type parameter —
      // so `{ storge: { … } }` compiles. Skipping it would drop a whole group
      // of variables the author believed they had configured, which is a
      // worse version of the failure the field-level check already refuses.
      const known = [
        ...Object.keys(SEAM_BY_GROUP),
        ...Object.keys(FIELD_GROUP_BY_GROUP),
      ]
        .sort()
        .join(', ');

      throw new Error(
        `"${group}" is not a configuration group — expected one of: ${known}`,
      );
    }

    write(
      env,
      reverse(flat.fields),
      chosen as Record<string, unknown>,
      flat.label,
      requiredFieldsOf(flat.fields, flat.required),
    );
  }

  return env;
}

/**
 * A field set to `undefined` is omitted rather than written blank: a blank
 * variable means unset (see `blankAsUndefined`), so writing `S3_ENDPOINT_URL=`
 * would say something the schema then has to undo.
 *
 * A field the group does not name **throws**, and that is deliberate. The
 * types cannot catch it: `defineConfig` infers a generic `C extends
 * RagenConfig`, and TypeScript does not apply excess-property checking to an
 * object literal inferred as a type parameter, so `{ url: '…', host: '…' }`
 * compiles. Silently dropping `host` would write an environment missing a
 * variable the author believed they had set — the failure would surface at
 * whatever needed it, which is the class of problem this whole package exists
 * to move to startup. Refusing at the point the config is turned into an
 * environment is as early as it can be caught.
 */
function write(
  env: Record<string, string>,
  fieldToVar: Record<string, string>,
  fields: Record<string, unknown>,
  groupLabel: string,
  requiredFields: readonly string[] = [],
): void {
  // A required field must be present and non-blank before anything is
  // written. The type does not get this right on its own: the field is typed
  // `string`, and `''` satisfies `string` — so `region: ''` compiles, writes
  // `S3_REGION=`, and a blank variable reads as *unset* everywhere else in
  // this package (`blankAsUndefined`, and `isSet` in `rules.ts`). Without
  // this, a config that typechecks could still produce an environment the
  // boot-time check rejects for a missing variable.
  for (const field of requiredFields) {
    const value = fields[field];

    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `${groupLabel}: "${field}" is required and must not be blank — it becomes ${fieldToVar[field]}, and a blank variable reads as unset.`,
      );
    }
  }

  for (const [field, value] of Object.entries(fields)) {
    const name = fieldToVar[field];

    if (name === undefined) {
      const known = Object.keys(fieldToVar).sort().join(', ');
      throw new Error(
        `${groupLabel} has no field "${field}" — expected one of: ${known || '(none)'}`,
      );
    }

    if (value === undefined) {
      continue;
    }

    env[name] = String(value);
  }
}
