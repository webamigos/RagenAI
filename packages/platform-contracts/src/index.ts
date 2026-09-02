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
  sanitizeFeatureOverrides,
} from './features/features';
export type {
  FeatureFlags,
  FeatureKey,
  FeatureOverrides,
} from './features/features';

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
