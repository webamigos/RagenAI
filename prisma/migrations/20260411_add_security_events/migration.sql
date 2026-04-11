-- CreateEnum
CREATE TYPE "SecurityEventSeverity" AS ENUM ('info', 'warn', 'critical');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM (
  'AUTH_LOGIN_FAILED',
  'AUTH_BRUTEFORCE_SUSPECTED',
  'AUTH_PASSWORD_RESET_REQUESTED',
  'AUTH_ADMIN_ROLE_GRANTED',
  'API_KEY_CREATED',
  'API_KEY_REVOKED',
  'API_INTERNAL_SECRET_MISMATCH',
  'CROSS_ORG_ACCESS_ATTEMPTED',
  'UNAUTHORIZED_ACCESS_ATTEMPTED',
  'CHAT_JAILBREAK_DETECTED',
  'TOOL_CALL_BLOCKED',
  'TOOL_CALL_DENIED',
  'TOOL_ARGS_HIGH_RISK',
  'UPLOAD_SUSPICIOUS_CONTENT',
  'UPLOAD_REJECTED',
  'ADMIN_SETTINGS_CHANGED',
  'RATE_LIMIT_HIT',
  'MCP_OAUTH_FAILED'
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT,
    "event_type" "SecurityEventType" NOT NULL,
    "severity" "SecurityEventSeverity" NOT NULL,
    "source" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "resolved_at" TIMESTAMPTZ,
    "resolved_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_events_public_id_key" ON "security_events"("public_id");

-- CreateIndex
CREATE INDEX "security_events_organization_id_created_at_idx" ON "security_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_event_type_created_at_idx" ON "security_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "security_events_severity_created_at_idx" ON "security_events"("severity", "created_at");

-- CreateIndex
CREATE INDEX "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_resolved_at_idx" ON "security_events"("resolved_at");

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
