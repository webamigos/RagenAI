/**
 * Contracts that more than one app has to agree on.
 *
 * Everything here was previously hand-copied between `apps/web`, `apps/api` and
 * `apps/admin`, with a comment in each copy asking the next reader to keep them
 * in sync. Two of those lists had already drifted by the time this package was
 * written — see ADR-33 and
 * docs/lessons/hand-copied-lists-drift-and-typecheck-only-sees-one.md.
 *
 * What belongs here: a value two apps must resolve identically, with no
 * dependency on a generated Prisma client, a framework, or an app's env. What
 * does not: anything a deployment configures (which models LiteLLM serves is
 * read from the proxy at runtime, not from here) and anything needing
 * `Prisma.defineExtension`, which each app must bind to its own client.
 */
export {
  MODEL_REGISTRY,
  isReasoningModel,
  normalizeModelId,
  selectableModels,
  supportsReasoningEffort,
} from './llm/model-catalog';
export type {
  AvailableModel,
  ModelOrigin,
  ModelProvider,
  ModelRegistryEntry,
} from './llm/model-catalog';

export {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_SOURCE_LABELS,
  PLATFORM_FEATURE_DEFAULTS_KEY,
  flattenFeatures,
  resolveFeatures,
  sanitizeFeatureOverrides,
} from './features/features';
export type {
  FeatureFlags,
  FeatureKey,
  FeatureOverrides,
  FeatureResolution,
  FeatureResolutionInput,
  FeatureSource,
  PlatformFeatureDefaults,
  ResolvedFeature,
} from './features/features';

export {
  DEMO_FEATURE_OVERRIDES,
  DEMO_MONTHLY_COST_LIMIT_CENTS,
  DEMO_ORGANIZATION_RESTRICTIONS,
} from './demo/demo-organization';
export type { DemoOrganizationRestrictions } from './demo/demo-organization';

export {
  CONNECTOR_ICON_PATHS,
  CONNECTOR_LIST,
  CONNECTOR_METADATA,
  CONNECTOR_PROVIDERS,
  isConnectorProvider,
} from './connectors/connectors';
export type {
  ConnectorDefinition,
  ConnectorProvider,
} from './connectors/connectors';

export {
  APP_ADMIN_ROLE,
  APP_USER_ROLE,
  NO_ACCESS_PRINCIPAL,
  ORG_ADMIN_ROLE,
  ORG_MEMBER_ROLE,
  ORG_OWNER_ROLE,
  ORG_ROLES,
  canManageOrg,
  canOwnOrg,
  hasOrgRole,
  isAppAdmin,
  isOrgRole,
  orgVisibilityScope,
} from './roles/roles';
export type { AppRole, OrgRole, OrgVisibilityScope } from './roles/roles';

export {
  TENANT_SCOPED_MODELS,
  isTenantScopeSatisfied,
} from './tenant-scope/tenant-scope';
export type { TenantScopeViolation } from './tenant-scope/tenant-scope';

export {
  REDACTED,
  SENSITIVE_FIELDS,
  stripSensitiveFields,
} from './audit/redaction';

export {
  buildCsvString,
  csvDownloadHeaders,
  escapeCsvCell,
  safeCsvFilename,
} from './csv/csv';

export {
  AI_USAGE_SUM_FIELDS,
  joinOrgStorage,
  joinProjectStorage,
  sumStorage,
  toAiUsageTotals,
} from './usage/usage';
export type {
  AiUsageAggregate,
  AiUsageTotals,
  OrgStorageSummary,
  ProjectAggregateRow,
  ProjectStorageSummary,
  StorageAggregateRow,
  StorageTotals,
  UsageOrganization,
} from './usage/usage';

export {
  REGISTRATION_ENABLED_KEY,
  REGISTRATION_ENABLED_BY_DEFAULT,
  registrationIsEnabled,
  registrationSettingValue,
} from './registration/registration';
