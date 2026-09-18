-- Guardrails, Phase A3.
--
-- Two tables, four enums, three new members on existing enums, and a seed that
-- preserves today's moderation behaviour rather than replacing it.
--
-- **Nothing reads these rows yet.** Phase A ships no evaluator on purpose: the
-- three members added to `AiUsageStep` and `SecurityEventType` have to reach
-- every one of the three independently deployed Prisma clients before any
-- writer exists. See docs/lessons/adding-an-enum-value-breaks-older-readers.md.

-- CreateEnum
CREATE TYPE "GuardrailKind" AS ENUM ('BUILT_IN', 'PATTERN', 'LLM_POLICY');

-- CreateEnum
CREATE TYPE "GuardrailStage" AS ENUM ('INPUT', 'OUTPUT', 'BOTH');

-- CreateEnum
CREATE TYPE "GuardrailAction" AS ENUM ('BLOCK', 'MASK', 'LOG');

-- CreateEnum
CREATE TYPE "GuardrailOverrideOrigin" AS ENUM ('legacy_on_premise');

-- AlterEnum
ALTER TYPE "AiUsageStep" ADD VALUE 'GUARDRAIL';

-- AlterEnum
-- Two values on one type. Safe from PostgreSQL 12 onwards, and this repository
-- requires 16; neither value is *used* anywhere in this migration, which is the
-- restriction that actually bites.
ALTER TYPE "SecurityEventType" ADD VALUE 'GUARDRAIL_BLOCKED';
ALTER TYPE "SecurityEventType" ADD VALUE 'GUARDRAIL_FLAGGED';

-- CreateTable
CREATE TABLE "guardrails" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "GuardrailKind" NOT NULL,
    "stage" "GuardrailStage" NOT NULL,
    "action" "GuardrailAction" NOT NULL DEFAULT 'LOG',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "severity" "SecurityEventSeverity" NOT NULL DEFAULT 'warn',
    "pattern" TEXT,
    "pattern_is_regex" BOOLEAN NOT NULL DEFAULT false,
    "policy" TEXT,
    "threshold" DOUBLE PRECISION,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "guardrails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardrail_org_overrides" (
    "id" SERIAL NOT NULL,
    "guardrail_id" INTEGER NOT NULL,
    "organization_id" TEXT NOT NULL,
    "enabled" BOOLEAN,
    "action" "GuardrailAction",
    "threshold" DOUBLE PRECISION,
    "origin" "GuardrailOverrideOrigin",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "guardrail_org_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardrails_public_id_key" ON "guardrails"("public_id");

-- CreateIndex
CREATE INDEX "guardrails_organization_id_enabled_idx" ON "guardrails"("organization_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "guardrails_organization_id_key_key" ON "guardrails"("organization_id", "key");

-- CreateIndex
-- The one Prisma cannot express, and the one that matters.
--
-- `@@unique([organization_id, key])` above does NOT stop two platform rules
-- claiming the same built-in: Postgres treats NULLs as distinct, so every
-- platform row is trivially unique on that index by virtue of having no
-- organization. Without this, the resolver can be handed two verdicts for one
-- detector and has no defined answer.
CREATE UNIQUE INDEX "guardrails_platform_key_unique"
  ON "guardrails" ("key") WHERE "organization_id" IS NULL AND "key" IS NOT NULL;

-- CreateIndex
CREATE INDEX "guardrail_org_overrides_organization_id_idx" ON "guardrail_org_overrides"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardrail_org_overrides_guardrail_id_organization_id_key" ON "guardrail_org_overrides"("guardrail_id", "organization_id");

-- AddForeignKey
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardrail_org_overrides" ADD CONSTRAINT "guardrail_org_overrides_guardrail_id_fkey" FOREIGN KEY ("guardrail_id") REFERENCES "guardrails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardrail_org_overrides" ADD CONSTRAINT "guardrail_org_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The seed, or the half of it SQL can do.
--
-- No migration in this repository contains an INSERT, and none can read
-- `process.env`. That splits today's moderation semantics in two:
--
--   MODERATION_ENABLED=1                       env — SQL cannot see it
--   OrganizationSettings.content_moderation_enabled   a column — SQL can
--
-- What is here is the per-organization half, which survives exactly. The
-- global half is why both built-ins are seeded `enabled = false`: that is the
-- safe side of a guess, since no installation starts blocking something it was
-- not blocking. An installation that *was* moderating would silently stop at
-- the Phase B cutover, so the cutover is gated on `npm run guardrails:preflight`
-- rather than on this migration having guessed right.

INSERT INTO "guardrails" (
  "public_id", "organization_id", "key", "name", "description",
  "kind", "stage", "action", "enabled", "severity", "updated_at"
) VALUES
  (
    gen_random_uuid(), NULL, 'content-moderation', 'Content moderation',
    'The provider''s moderation endpoint, over the user''s message.',
    'BUILT_IN', 'INPUT', 'BLOCK', false, 'warn', CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), NULL, 'jailbreak-detection', 'Jailbreak detection',
    'A classifier scoring how much a message looks like an attempt to override the assistant''s instructions.',
    'BUILT_IN', 'INPUT', 'LOG', false, 'warn', CURRENT_TIMESTAMP
  );

-- One override per organization that has an explicit answer recorded, carrying
-- that answer. `IS NOT NULL` is the whole filter: null means "never decided",
-- which is inherit, which is what having no override already says.
--
-- **`origin` is what keeps this from changing behaviour.** The column it copies
-- is read only when IS_ON_PREMISE; in SaaS it is ignored and the organization
-- is moderated regardless of what it holds. An override honoured everywhere
-- would therefore turn moderation *off* for the SaaS tenants sitting on
-- `false` — a silent downgrade, in the one direction nobody would choose. The
-- resolver skips an override marked `legacy_on_premise` unless the installation
-- is on-premise, so this seed preserves both readings instead of merging them.
-- An override an administrator creates later carries no marking and applies
-- everywhere, which is the point of the feature.
INSERT INTO "guardrail_org_overrides" (
  "guardrail_id", "organization_id", "enabled", "origin", "updated_at"
)
SELECT
  g."id",
  s."organization_id",
  s."content_moderation_enabled",
  'legacy_on_premise',
  CURRENT_TIMESTAMP
FROM "organization_settings" s
CROSS JOIN "guardrails" g
WHERE s."content_moderation_enabled" IS NOT NULL
  AND g."key" = 'content-moderation'
  AND g."organization_id" IS NULL;
