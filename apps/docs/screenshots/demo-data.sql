-- Demo data for the admin-panel screenshots.
--
-- The panel's pages are only worth photographing with something in them: an
-- empty Connector Health table says nothing, and an API Keys page with no
-- rows cannot show what "never used" looks like. This file produces the
-- states the documentation describes.
--
-- ## Run it against the e2e database, never a real one
--
--   psql "postgresql://postgres:pass123@localhost:55432/ragen_e2e" \
--     -f apps/docs/screenshots/demo-data.sql
--
-- It DELETEs from api_keys and mcp_connectors and overwrites three `settings`
-- rows, so it is destructive by design. `ragen_e2e` is rebuilt by
-- `npm run test:e2e`'s global setup, which is why it is the right target.
-- The seeded e2e user (e2e-test@ragen.ai) must already exist.
--
-- Regenerate the images with:
--   npx tsx apps/docs/screenshots/capture.mts

BEGIN;

-- API keys, one per interesting state: healthy, never called, long idle with
-- debug mode on, deactivated, and one whose organization was deleted.
DELETE FROM api_keys;

INSERT INTO api_keys (
  id, name, masked_value, is_active, last_used_at, created_at, created_by,
  updated_at, organization_id, project_id, debug_mode
)
SELECT
  gen_random_uuid(), 'production-backend', 'sk-a41f...9f2c', true,
  now() - interval '2 hours', now() - interval '40 days',
  (SELECT id FROM users WHERE email = 'e2e-test@ragen.ai'), now(),
  'e2e-test-org-00000-0000-0001', (SELECT id FROM projects LIMIT 1), false
UNION ALL SELECT
  gen_random_uuid(), 'staging-import', 'sk-77b2...1a0b', true,
  NULL, now() - interval '120 days',
  (SELECT id FROM users WHERE email = 'e2e-test@ragen.ai'), now(),
  'e2e-test-org-00000-0000-0001', NULL, false
UNION ALL SELECT
  gen_random_uuid(), 'zapier-webhook', 'sk-c930...77de', true,
  now() - interval '200 days', now() - interval '300 days',
  NULL, now(), 'e2e-test-org-00000-0000-0001', NULL, true
UNION ALL SELECT
  gen_random_uuid(), 'old-ci-runner', 'sk-e5a8...4c31', false,
  now() - interval '9 days', now() - interval '30 days',
  (SELECT id FROM users WHERE email = 'e2e-test@ragen.ai'), now(),
  'e2e-test-org-00000-0000-0001', NULL, false;

-- Connectors: two failing for different reasons, one healthy, one pending
-- and switched off by its user.
DELETE FROM mcp_connectors;

INSERT INTO mcp_connectors (
  id, organization_id, user_id, provider, mcp_server_url, customer_id,
  enabled, status, connected_at, created_at, updated_at, last_error,
  last_error_at
)
SELECT
  gen_random_uuid(), 'e2e-test-org-00000-0000-0001', u.id,
  'SLACK'::"McpConnectorProvider", 'https://mcp.slack.com/mcp',
  'e2e-test-org-00000-0000-0001:' || u.id || ':slack',
  true, 'ERROR'::"McpConnectorStatus",
  now() - interval '60 days', now() - interval '60 days', now(),
  'HTTP 401 Unauthorized: {"error":"invalid_grant","description":"token has been revoked by the user"}',
  now() - interval '3 hours'
FROM users u WHERE u.email = 'e2e-test@ragen.ai'
UNION ALL SELECT
  gen_random_uuid(), 'e2e-test-org-00000-0000-0001', u.id,
  'CLICKUP'::"McpConnectorProvider", 'https://mcp.clickup.com/mcp',
  'e2e-test-org-00000-0000-0001:' || u.id || ':clickup',
  true, 'ERROR'::"McpConnectorStatus",
  now() - interval '10 days', now() - interval '10 days', now(),
  'fetch failed', now() - interval '9 minutes'
FROM users u WHERE u.email = 'e2e-other@ragen.ai'
UNION ALL SELECT
  gen_random_uuid(), 'e2e-test-org-00000-0000-0001', u.id,
  'HUBSPOT'::"McpConnectorProvider", 'https://mcp.hubspot.com/mcp',
  'e2e-test-org-00000-0000-0001:' || u.id || ':hubspot',
  true, 'CONNECTED'::"McpConnectorStatus",
  now() - interval '2 days', now() - interval '2 days', now(), NULL, NULL
FROM users u WHERE u.email = 'e2e-test@ragen.ai'
UNION ALL SELECT
  gen_random_uuid(), 'e2e-test-org-00000-0000-0001', u.id,
  'FIREFLIES'::"McpConnectorProvider", 'https://mcp.fireflies.ai/mcp',
  'e2e-test-org-00000-0000-0001:' || u.id || ':fireflies',
  false, 'PENDING'::"McpConnectorStatus",
  NULL, now() - interval '1 day', now(), NULL, NULL
FROM users u WHERE u.email = 'e2e-other@ragen.ai';

-- Platform defaults, with some fields deliberately left unset so the Apply
-- Defaults page has a real "left alone, because the default does not set
-- them" list to show. The RAG default is deliberately absent, which is the
-- state that makes that page refuse rather than guess.
INSERT INTO settings (key, value) VALUES
  (
    'default_organization_limits',
    '{"storageLimitBytes":5000000000,"projectStorageLimitBytes":1000000000,"singleFileLimitBytes":50000000,"monthlyTokenLimit":null,"monthlyCostLimitCents":2000,"monthlyMessageLimit":null,"monthlyApiRequestLimit":100,"maxMembers":null}'
  ),
  ('default_allowed_models', '["gpt-5.4","gemini-2.5-flash"]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

DELETE FROM settings WHERE key = 'default_rag_pipeline_settings';

-- One organization keeps a deliberate member cap the default does not set,
-- so the Apply Defaults preview can demonstrate that propagation will not
-- clear it.
UPDATE organization_settings
SET max_members = 25, allowed_models = ARRAY['gpt-5.4']
WHERE organization_id = 'e2e-test-org-00000-0000-0001';

-- Audit trail and incidents.
--
-- These two pages existed before phase 1 and rendered "No activity logs
-- found." on every install, because the panel wrote to neither. Seeding them
-- is what makes the screenshots show the feature rather than its absence.
DELETE FROM audit_logs WHERE action LIKE 'admin.%';
DELETE FROM security_events WHERE source = 'admin';

INSERT INTO audit_logs (
  organization_id, user_id, action, entity_type, entity_id, old_data,
  new_data, created_at
)
SELECT
  'e2e-test-org-00000-0000-0001', u.id, a.action, a.entity_type, a.entity_id,
  a.old_data::jsonb, a.new_data::jsonb, now() - a.ago
FROM users u
CROSS JOIN (VALUES
  ('admin.organization.limits_changed', 'organization', 'e2e-test-org-00000-0000-0001',
   '{"monthlyCostLimitCents": 1000}', '{"monthlyCostLimitCents": 2000}', interval '18 minutes'),
  ('admin.api_key.revoked', 'api-key', 'a41f9c2e-0000-0000-0000-000000000001',
   '{"name": "legacy-integration", "maskedValue": "[REDACTED]"}',
   '{"isActive": false, "vaultSecretDeleted": true, "rowDeleted": true}', interval '2 hours'),
  ('admin.member.role_changed', 'member', 'e2e-other-user-0000-0000-0001',
   '{"role": "member"}', '{"role": "admin"}', interval '6 hours'),
  ('admin.organization.models_changed', 'organization', 'e2e-test-org-00000-0000-0001',
   '{"allowedModels": "no restriction"}', '{"allowedModels": "gpt-5.4, gemini-2.5-flash"}', interval '1 day'),
  ('admin.user.platform_role_granted', 'user', 'e2e-other-user-0000-0000-0001',
   '{"role": "user"}', '{"role": "admin"}', interval '2 days'),
  ('admin.invitation.resent', 'invitation', 'inv-000000000000000000000001',
   NULL, '{"email": "newcomer@example.com", "outcome": {"ok": true}}', interval '3 days'),
  ('admin.export.downloaded', 'export', 'activity-log',
   NULL, '{"dataset": "activity-log", "rows": 412}', interval '4 days')
) AS a(action, entity_type, entity_id, old_data, new_data, ago)
WHERE u.email = 'e2e-test@ragen.ai';

-- `public_id` is defaulted by Prisma, not by the database, so raw SQL has to
-- supply it.
INSERT INTO security_events (
  public_id, organization_id, user_id, event_type, severity, source, metadata,
  resolved_at, created_at
)
SELECT
  gen_random_uuid(),
  'e2e-test-org-00000-0000-0001', NULL, e.event_type::"SecurityEventType",
  e.severity::"SecurityEventSeverity", e.source, e.metadata::jsonb,
  e.resolved, now() - e.ago
FROM (VALUES
  ('MCP_OAUTH_FAILED', 'warn', 'mcp',
   '{"provider": "SLACK", "source": "runtime_init", "reason": "HTTP 401 Unauthorized"}',
   NULL::timestamptz, interval '3 hours'),
  ('API_KEY_REVOKED', 'warn', 'admin',
   '{"action": "admin.api_key.revoked", "actorEmail": "admin@example.com"}',
   NULL::timestamptz, interval '2 hours'),
  ('AUTH_LOGIN_FAILED', 'warn', 'auth',
   '{"attempts": 4, "email": "[REDACTED]"}', NULL::timestamptz, interval '20 minutes'),
  ('AUTH_BRUTEFORCE_SUSPECTED', 'critical', 'auth',
   '{"attempts": 27, "window": "5m"}', NULL::timestamptz, interval '9 minutes'),
  ('RATE_LIMIT_HIT', 'info', 'api',
   '{"route": "/v1/chat/completions", "keyId": "a41f9c2e"}',
   now() - interval '1 day', interval '2 days')
) AS e(event_type, severity, source, metadata, resolved, ago);

-- Feature layers, so the Features page can show all four sources at once:
-- a platform default, a plan value being overruled, and an organization
-- override doing real work.
INSERT INTO settings (key, value)
VALUES ('default_features', '{"inviteMembers":true,"apiAccess":true}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

UPDATE organization_settings
SET feature_overrides = '{"publicChatbot":true}'
WHERE organization_id = 'e2e-test-org-00000-0000-0001';

UPDATE subscription_plans
SET features = '{"publicChatbot":false,"apiAccess":false}'
WHERE name = 'Trial';

-- A storage ceiling, so Disk Usage has a percentage to draw rather than
-- "Unlimited" on every row.
UPDATE organization_settings
SET storage_limit_bytes = 2048
WHERE organization_id = 'e2e-test-org-00000-0000-0001';

-- One model call, so AI Usage shows numbers instead of the empty state.
INSERT INTO ai_usage (
  id, organization_id, user_id, step, provider, model, input_tokens,
  output_tokens, total_tokens, estimated_cost, created_at
)
SELECT
  gen_random_uuid(), 'e2e-test-org-00000-0000-0001', u.id,
  'CHAT_COMPLETION'::"AiUsageStep", 'litellm', 'gpt-5.4',
  1200, 340, 1540, 0.0123, now() - interval '2 hours'
FROM users u WHERE u.email = 'e2e-test@ragen.ai';

COMMIT;
