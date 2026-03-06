-- CreateEnum
CREATE TYPE "McpConnectorStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "McpConnectorProvider" AS ENUM ('GOOGLE_CALENDAR', 'GOOGLE_ANALYTICS', 'GOOGLE_ADS');

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

-- CreateIndex
CREATE INDEX "mcp_connectors_organization_id_idx" ON "mcp_connectors"("organization_id");

-- CreateIndex
CREATE INDEX "mcp_connectors_user_id_idx" ON "mcp_connectors"("user_id");

-- CreateIndex
CREATE INDEX "mcp_connectors_organization_id_user_id_idx" ON "mcp_connectors"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_connectors_organization_id_user_id_provider_key" ON "mcp_connectors"("organization_id", "user_id", "provider");

-- AddForeignKey
ALTER TABLE "mcp_connectors" ADD CONSTRAINT "mcp_connectors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_connectors" ADD CONSTRAINT "mcp_connectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
