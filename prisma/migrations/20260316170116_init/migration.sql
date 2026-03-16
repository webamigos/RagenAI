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
CREATE TYPE "SubscriptionPlanType" AS ENUM ('INTERNAL', 'STRIPE');

-- CreateEnum
CREATE TYPE "SubscriptionPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ThreadCommunicationType" AS ENUM ('TEXT', 'VOICE');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'VOICE');

-- CreateEnum
CREATE TYPE "AiUsageStep" AS ENUM ('MODERATION', 'CHAT_COMPLETION', 'REPHRASING', 'EMBEDDINGS');

-- CreateEnum
CREATE TYPE "McpConnectorStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "McpConnectorProvider" AS ENUM ('GOOGLE_CALENDAR', 'GOOGLE_ANALYTICS', 'GOOGLE_ADS', 'GOOGLE_DRIVE', 'CLICKUP', 'HUBSPOT', 'FIREFLIES');

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
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
    "attachments" JSONB,
    "source" "Source" NOT NULL DEFAULT 'UI',

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flagged_messages" (
    "public_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "id" TEXT NOT NULL,

    CONSTRAINT "flagged_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
    "title" TEXT,
    "visitor_id" TEXT,
    "organization_id" TEXT,
    "user_id" TEXT,
    "preferred_communication_type" "ThreadCommunicationType" NOT NULL DEFAULT 'TEXT',
    "preferred_model" TEXT,
    "source" "Source" NOT NULL DEFAULT 'UI',
    "project_id" INTEGER,
    "mentioned_project_id" INTEGER,
    "is_starred" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "team_id" TEXT,

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
    "public_id" UUID NOT NULL,
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
    "thumbnail_s3_key" TEXT,
    "source_file_id" TEXT,
    "folder_id" UUID,

    CONSTRAINT "user_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_documents" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
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
    "user_file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "openai_api_key" TEXT,
    "anthropic_api_key" TEXT,
    "google_api_key" TEXT,
    "bedrock_credentials" TEXT,
    "ollama_host" TEXT,
    "openrouter_api_key" TEXT,
    "fireworks_api_key" TEXT,
    "azure_openai_credentials" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "prompt" TEXT,
    "max_documents_to_retrieve" INTEGER,
    "voice_id" TEXT,
    "storage_limit_bytes" BIGINT,
    "project_storage_limit_bytes" BIGINT,
    "single_file_limit_bytes" BIGINT,
    "monthly_token_limit" BIGINT,
    "monthly_cost_limit_cents" INTEGER,
    "monthly_message_limit" INTEGER,
    "max_members" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "period_start" TIMESTAMPTZ,
    "period_end" TIMESTAMPTZ,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "trial_start" TIMESTAMPTZ,
    "trial_end" TIMESTAMPTZ,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_id" TEXT NOT NULL,
    "type" "SubscriptionPlanType" NOT NULL DEFAULT 'INTERNAL',
    "status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "features" JSONB,
    "limits" JSONB NOT NULL,
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "metadata" JSONB,
    "product_id" TEXT,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "organization_id" TEXT,
    "owner_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ,
    "access_token" UUID,
    "chatbot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" "Source" NOT NULL DEFAULT 'UI',

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_settings" (
    "id" UUID NOT NULL,
    "project_id" INTEGER NOT NULL,
    "instructions" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
    "masked_value" TEXT NOT NULL,
    "hashed_value" TEXT,
    "last_used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "organization_id" TEXT,
    "project_id" INTEGER,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "view_mode" TEXT NOT NULL DEFAULT 'list',
    "role" TEXT NOT NULL DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "ban_reason" TEXT,
    "ban_expires" TIMESTAMPTZ,
    "stripe_customer_id" TEXT,

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
    "impersonated_by" TEXT,

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
    "access_token_expires_at" TIMESTAMPTZ,
    "scope" TEXT,
    "expires_at" TIMESTAMPTZ,
    "password" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "logo" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "metadata" JSONB,
    "has_knowledge" BOOLEAN NOT NULL DEFAULT false,
    "vector_store" TEXT,

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
    "team_id" TEXT,
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

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "public_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_folders" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "team_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_connectors" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "McpConnectorProvider" NOT NULL,
    "mcp_server_url" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "McpConnectorStatus" NOT NULL DEFAULT 'PENDING',
    "connected_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mcp_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_tokens" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "McpConnectorProvider" NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ,
    "token_type" TEXT NOT NULL DEFAULT 'Bearer',
    "client_id" TEXT,
    "client_secret" TEXT,
    "code_verifier" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usages" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" INTEGER,
    "thread_id" UUID,
    "user_id" TEXT,
    "step" "AiUsageStep" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usages_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "threads_visitor_id_is_starred_created_at_idx" ON "threads"("visitor_id", "is_starred", "created_at");

-- CreateIndex
CREATE INDEX "threads_team_id_idx" ON "threads"("team_id");

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
CREATE INDEX "user_files_source_file_id_idx" ON "user_files"("source_file_id");

-- CreateIndex
CREATE INDEX "user_files_folder_id_idx" ON "user_files"("folder_id");

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
CREATE UNIQUE INDEX "organization_settings_organization_id_key" ON "organization_settings"("organization_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions"("plan");

-- CreateIndex
CREATE INDEX "subscriptions_reference_id_idx" ON "subscriptions"("reference_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_public_id_key" ON "subscription_plans"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_product_id_key" ON "subscription_plans"("product_id");

-- CreateIndex
CREATE INDEX "subscription_plans_price_id_idx" ON "subscription_plans"("price_id");

-- CreateIndex
CREATE INDEX "subscription_plans_name_idx" ON "subscription_plans"("name");

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
CREATE UNIQUE INDEX "project_settings_project_id_key" ON "project_settings"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_public_id_key" ON "api_keys"("public_id");

-- CreateIndex
CREATE INDEX "api_keys_public_id_idx" ON "api_keys"("public_id");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");

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
CREATE UNIQUE INDEX "organizations_public_id_key" ON "organizations"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_public_id_idx" ON "organizations"("public_id");

-- CreateIndex
CREATE INDEX "members_user_id_idx" ON "members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_organization_id_user_id_key" ON "members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "invitations_team_id_idx" ON "invitations"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_organization_id_email_key" ON "invitations"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "verifications_identifier_value_key" ON "verifications"("identifier", "value");

-- CreateIndex
CREATE UNIQUE INDEX "teams_public_id_key" ON "teams"("public_id");

-- CreateIndex
CREATE INDEX "teams_organization_id_idx" ON "teams"("organization_id");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "document_folders_organization_id_idx" ON "document_folders"("organization_id");

-- CreateIndex
CREATE INDEX "document_folders_team_id_idx" ON "document_folders"("team_id");

-- CreateIndex
CREATE INDEX "mcp_connectors_organization_id_idx" ON "mcp_connectors"("organization_id");

-- CreateIndex
CREATE INDEX "mcp_connectors_user_id_idx" ON "mcp_connectors"("user_id");

-- CreateIndex
CREATE INDEX "mcp_connectors_organization_id_user_id_idx" ON "mcp_connectors"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_connectors_organization_id_user_id_provider_key" ON "mcp_connectors"("organization_id", "user_id", "provider");

-- CreateIndex
CREATE INDEX "mcp_oauth_tokens_organization_id_user_id_idx" ON "mcp_oauth_tokens"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_tokens_organization_id_user_id_provider_key" ON "mcp_oauth_tokens"("organization_id", "user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usages_public_id_key" ON "ai_usages"("public_id");

-- CreateIndex
CREATE INDEX "ai_usages_organization_id_idx" ON "ai_usages"("organization_id");

-- CreateIndex
CREATE INDEX "ai_usages_project_id_idx" ON "ai_usages"("project_id");

-- CreateIndex
CREATE INDEX "ai_usages_user_id_idx" ON "ai_usages"("user_id");

-- CreateIndex
CREATE INDEX "ai_usages_created_at_idx" ON "ai_usages"("created_at");

-- CreateIndex
CREATE INDEX "ai_usages_step_idx" ON "ai_usages"("step");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "user_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "user_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_documents" ADD CONSTRAINT "user_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_documents" ADD CONSTRAINT "thread_documents_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_documents" ADD CONSTRAINT "thread_documents_user_file_id_fkey" FOREIGN KEY ("user_file_id") REFERENCES "user_files"("public_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_connectors" ADD CONSTRAINT "mcp_connectors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_connectors" ADD CONSTRAINT "mcp_connectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
