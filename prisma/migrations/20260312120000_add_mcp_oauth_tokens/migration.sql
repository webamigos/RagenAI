-- CreateTable
CREATE TABLE "mcp_oauth_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_oauth_tokens_organization_id_user_id_idx" ON "mcp_oauth_tokens"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_tokens_organization_id_user_id_provider_key" ON "mcp_oauth_tokens"("organization_id", "user_id", "provider");

-- AddForeignKey
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
