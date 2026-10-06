CREATE TABLE "mcp_grant_activity" (
 "user_id" TEXT NOT NULL,
 "client_id" TEXT NOT NULL,
 "organization_id" TEXT NOT NULL,
 "last_used_at" TIMESTAMPTZ NOT NULL,
 CONSTRAINT "mcp_grant_activity_pkey" PRIMARY KEY ("user_id", "client_id"),
 CONSTRAINT "mcp_grant_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "mcp_grant_activity_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
