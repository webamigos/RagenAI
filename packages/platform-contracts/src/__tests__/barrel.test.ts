import { describe, expect, it } from 'vitest';

import * as contracts from '../index';

/**
 * Every other test in this package imports its subject from the source module
 * directly, so a barrel that stopped re-exporting something would break the
 * three apps and none of these tests. This asserts the public entry point.
 */
describe('the public entry point', () => {
  it.each([
    ['MODEL_REGISTRY', 'object'],
    ['selectableModels', 'function'],
    ['isReasoningModel', 'function'],
    ['supportsReasoningEffort', 'function'],
    ['normalizeModelId', 'function'],
    ['FEATURE_KEYS', 'object'],
    ['DEFAULT_FEATURES', 'object'],
    ['FEATURE_LABELS', 'object'],
    ['sanitizeFeatureOverrides', 'function'],
    ['CONNECTOR_PROVIDERS', 'object'],
    ['CONNECTOR_METADATA', 'object'],
    ['CONNECTOR_LIST', 'object'],
    ['CONNECTOR_ICON_PATHS', 'object'],
    ['isConnectorProvider', 'function'],
    ['TENANT_SCOPED_MODELS', 'object'],
    ['isTenantScopeSatisfied', 'function'],
    ['SENSITIVE_FIELDS', 'object'],
    ['stripSensitiveFields', 'function'],
    ['REDACTED', 'string'],
    ['escapeCsvCell', 'function'],
    ['buildCsvString', 'function'],
    ['safeCsvFilename', 'function'],
    ['csvDownloadHeaders', 'function'],
    ['ORG_ROLES', 'object'],
    ['canManageOrg', 'function'],
    ['canOwnOrg', 'function'],
    ['orgVisibilityScope', 'function'],
    ['hasOrgRole', 'function'],
    ['isOrgRole', 'function'],
    ['isAppAdmin', 'function'],
  ])('exports %s as a %s', (name, kind) => {
    expect(name in contracts).toBe(true);
    expect(typeof (contracts as Record<string, unknown>)[name]).toBe(kind);
  });

  // Each module is represented, so a whole module dropped from the barrel is
  // caught rather than only an individual name.
  it('reaches every contract area', () => {
    expect(Object.keys(contracts).length).toBeGreaterThanOrEqual(30);
  });
});
