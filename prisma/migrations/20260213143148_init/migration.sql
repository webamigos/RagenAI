-- CreateEnum
CREATE TYPE "Source" AS ENUM ('UI', 'API', 'PUBLIC');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('UNKNOWN', 'TEXT', 'MARKDOWN', 'EPUB', 'PDF', 'SRT', 'URL');

-- CreateEnum
CREATE TYPE "EmbeddingStatus" AS ENUM ('NOT_STARTED', 'STARTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ParsingStatus" AS ENUM ('NOT_STARTED', 'STARTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'FREE', 'BASIC', 'TEAM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('INTERNAL', 'STRIPE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ThreadCommunicationType" AS ENUM ('TEXT', 'VOICE');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'VOICE');

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "thread_id" TEXT,
    "visitor_id" TEXT,
    "rate" SMALLINT,
    "run_id" TEXT,
    "message_type" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "voice_duration_seconds" INTEGER,
    "voice_played" BOOLEAN NOT NULL DEFAULT false,
    "source" "Source" NOT NULL DEFAULT 'UI',

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flagged_messages" (
    "public_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "id" TEXT NOT NULL,

    CONSTRAINT "flagged_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT,
    "visitor_id" TEXT,
    "organization_id" TEXT,
    "user_id" TEXT,
    "preferred_communication_type" "ThreadCommunicationType" NOT NULL DEFAULT 'TEXT',
    "preferred_model" TEXT,
    "source" "Source" NOT NULL DEFAULT 'UI',
    "project_id" INTEGER,
    "mentioned_project_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_messages" (
    "visitor_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL,

    CONSTRAINT "visitor_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_files" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" "FileType" NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "metadata" JSONB,
    "document_id" TEXT,
    "project_id" INTEGER,
    "is_uploaded" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMPTZ,
    "parsing_status" "ParsingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "parsing_started_at" TIMESTAMPTZ,
    "parsing_completed_at" TIMESTAMPTZ,
    "parsing_failed_at" TIMESTAMPTZ,
    "embedding_status" "EmbeddingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "embedding_started_at" TIMESTAMPTZ,
    "embedding_completed_at" TIMESTAMPTZ,
    "embedding_failed_at" TIMESTAMPTZ,
    "is_binary_file" BOOLEAN NOT NULL DEFAULT true,
    "file_extension" TEXT,
    "file_mime_type" TEXT,

    CONSTRAINT "user_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_documents" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "file_id" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "project_id" INTEGER,

    CONSTRAINT "user_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_documents" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "user_file_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_organizations" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "internal_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_start" TIMESTAMPTZ NOT NULL,
    "current_period_end" TIMESTAMPTZ NOT NULL,
    "trial_end" TIMESTAMPTZ,
    "canceled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PlanType" NOT NULL DEFAULT 'INTERNAL',
    "stripe_price_id" TEXT,
    "stripe_product_id" TEXT,
    "stripe_metadata" JSONB,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "features" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_periods" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "start_date" TIMESTAMPTZ NOT NULL,
    "end_date" TIMESTAMPTZ NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usage_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "internal_organization_id" INTEGER,
    "organization_id" TEXT,
    "owner_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ,
    "access_token" TEXT,
    "chatbot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" "Source" NOT NULL DEFAULT 'UI',

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "masked_value" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "organization_id" INTEGER,
    "project_id" INTEGER,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "view_mode" TEXT NOT NULL DEFAULT 'list',
    "role" TEXT NOT NULL DEFAULT 'user',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "active_organization_id" TEXT,
    "active_team_id" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "expires_at" TIMESTAMPTZ,
    "password" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "logo" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "metadata" JSONB,
    "has_knowledge" BOOLEAN NOT NULL DEFAULT false,
    "vector_store" TEXT,
    "ragen_org_id" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "inviter_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "messages_public_id_key" ON "messages"("public_id");

-- CreateIndex
CREATE INDEX "messages_public_id_idx" ON "messages"("public_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_idx" ON "messages"("thread_id");

-- CreateIndex
CREATE INDEX "messages_visitor_id_idx" ON "messages"("visitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "flagged_messages_public_id_key" ON "flagged_messages"("public_id");

-- CreateIndex
CREATE INDEX "flagged_messages_public_id_idx" ON "flagged_messages"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "threads_public_id_key" ON "threads"("public_id");

-- CreateIndex
CREATE INDEX "threads_public_id_idx" ON "threads"("public_id");

-- CreateIndex
CREATE INDEX "threads_organization_id_idx" ON "threads"("organization_id");

-- CreateIndex
CREATE INDEX "threads_user_id_idx" ON "threads"("user_id");

-- CreateIndex
CREATE INDEX "visitor_messages_visitor_id_idx" ON "visitor_messages"("visitor_id");

-- CreateIndex
CREATE INDEX "visitor_messages_message_id_idx" ON "visitor_messages"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_files_public_id_key" ON "user_files"("public_id");

-- CreateIndex
CREATE INDEX "user_files_organization_id_idx" ON "user_files"("organization_id");

-- CreateIndex
CREATE INDEX "user_files_public_id_idx" ON "user_files"("public_id");

-- CreateIndex
CREATE INDEX "user_files_project_id_idx" ON "user_files"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_files_id_organization_id_key" ON "user_files"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_documents_public_id_key" ON "user_documents"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_documents_file_id_key" ON "user_documents"("file_id");

-- CreateIndex
CREATE INDEX "user_documents_organization_id_idx" ON "user_documents"("organization_id");

-- CreateIndex
CREATE INDEX "user_documents_project_id_idx" ON "user_documents"("project_id");

-- CreateIndex
CREATE INDEX "thread_documents_thread_id_idx" ON "thread_documents"("thread_id");

-- CreateIndex
CREATE INDEX "thread_documents_user_file_id_idx" ON "thread_documents"("user_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "thread_documents_thread_id_user_file_id_key" ON "thread_documents"("thread_id", "user_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_organizations_public_id_key" ON "internal_organizations"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_organizations_provider_id_key" ON "internal_organizations"("provider_id");

-- CreateIndex
CREATE INDEX "internal_organizations_public_id_idx" ON "internal_organizations"("public_id");

-- CreateIndex
CREATE INDEX "internal_organizations_provider_id_idx" ON "internal_organizations"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_price_id_key" ON "plans"("stripe_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_product_id_key" ON "plans"("stripe_product_id");

-- CreateIndex
CREATE INDEX "plans_stripe_price_id_idx" ON "plans"("stripe_price_id");

-- CreateIndex
CREATE INDEX "plans_status_idx" ON "plans"("status");

-- CreateIndex
CREATE INDEX "usage_periods_subscription_id_end_date_idx" ON "usage_periods"("subscription_id", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "projects_public_id_key" ON "projects"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_access_token_key" ON "projects"("access_token");

-- CreateIndex
CREATE INDEX "projects_public_id_idx" ON "projects"("public_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "projects_access_token_idx" ON "projects"("access_token");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_public_id_key" ON "api_keys"("public_id");

-- CreateIndex
CREATE INDEX "api_keys_public_id_idx" ON "api_keys"("public_id");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "members_user_id_idx" ON "members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_organization_id_user_id_key" ON "members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_organization_id_email_key" ON "invitations"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "verifications_identifier_value_key" ON "verifications"("identifier", "value");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "user_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_documents" ADD CONSTRAINT "thread_documents_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_documents" ADD CONSTRAINT "thread_documents_user_file_id_fkey" FOREIGN KEY ("user_file_id") REFERENCES "user_files"("public_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "internal_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_periods" ADD CONSTRAINT "usage_periods_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_internal_organization_id_fkey" FOREIGN KEY ("internal_organization_id") REFERENCES "internal_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "internal_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
