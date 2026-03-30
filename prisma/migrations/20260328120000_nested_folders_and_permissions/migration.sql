-- Breaking change: DocumentFolder id UUID -> Int autoincrement + publicId UUID
-- Also adds: nested folders (parentId, path), ownership (ownerId), DocumentPermission model

-- Step 1: Create new document_folders table with Int id
CREATE TABLE "document_folders_new" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "team_id" TEXT,
    "parent_id" INTEGER,
    "path" TEXT NOT NULL DEFAULT '/',
    "owner_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate existing data (old UUID id becomes publicId)
INSERT INTO "document_folders_new" ("public_id", "name", "organization_id", "team_id", "path", "created_at", "updated_at")
SELECT "id", "name", "organization_id", "team_id", '/', "created_at", "updated_at"
FROM "document_folders";

-- Step 3: Create a mapping table for old UUID -> new Int id
CREATE TEMP TABLE folder_id_map AS
SELECT df_old."id" AS old_id, df_new."id" AS new_id
FROM "document_folders" df_old
JOIN "document_folders_new" df_new ON df_old."id"::uuid = df_new."public_id";

-- Step 4: Update user_files to use new Int folder_id
-- First add a temporary column
ALTER TABLE "user_files" ADD COLUMN "folder_id_new" INTEGER;

-- Map old UUID folder_id to new Int folder_id
UPDATE "user_files" uf
SET "folder_id_new" = fim.new_id
FROM folder_id_map fim
WHERE uf."folder_id"::uuid = fim.old_id::uuid;

-- Drop old folder_id column and rename new one
ALTER TABLE "user_files" DROP COLUMN "folder_id";
ALTER TABLE "user_files" RENAME COLUMN "folder_id_new" TO "folder_id";

-- Step 5: Drop old document_folders table and rename new one
DROP TABLE "document_folders";
ALTER TABLE "document_folders_new" RENAME TO "document_folders";

-- Step 6: Add constraints and indexes for document_folders
CREATE UNIQUE INDEX "document_folders_public_id_key" ON "document_folders"("public_id");
CREATE INDEX "document_folders_organization_id_idx" ON "document_folders"("organization_id");
CREATE INDEX "document_folders_team_id_idx" ON "document_folders"("team_id");
CREATE INDEX "document_folders_parent_id_idx" ON "document_folders"("parent_id");
CREATE INDEX "document_folders_owner_id_idx" ON "document_folders"("owner_id");
CREATE INDEX "document_folders_path_idx" ON "document_folders"("path");

ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 7: Add folder_id foreign key on user_files
CREATE INDEX "user_files_folder_id_idx" ON "user_files"("folder_id");

ALTER TABLE "user_files" ADD CONSTRAINT "user_files_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 8: Add owner_id to user_files
ALTER TABLE "user_files" ADD COLUMN "owner_id" TEXT;
CREATE INDEX "user_files_owner_id_idx" ON "user_files"("owner_id");

ALTER TABLE "user_files" ADD CONSTRAINT "user_files_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 9: Create document_permissions table with proper FK columns
CREATE TABLE "document_permissions" (
    "id" SERIAL NOT NULL,
    "resource_type" TEXT NOT NULL,
    "file_public_id" UUID,
    "folder_id" INTEGER,
    "grantee_type" TEXT NOT NULL,
    "grantee_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'view',
    "granted_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_permissions_resource_type_file_public_id_grantee_t_key"
    ON "document_permissions"("resource_type", "file_public_id", "grantee_type", "grantee_id");
CREATE UNIQUE INDEX "document_permissions_resource_type_folder_id_grantee_type_g_key"
    ON "document_permissions"("resource_type", "folder_id", "grantee_type", "grantee_id");
CREATE INDEX "document_permissions_file_public_id_idx"
    ON "document_permissions"("file_public_id");
CREATE INDEX "document_permissions_folder_id_idx"
    ON "document_permissions"("folder_id");
CREATE INDEX "document_permissions_grantee_type_grantee_id_idx"
    ON "document_permissions"("grantee_type", "grantee_id");

ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_file_public_id_fkey"
    FOREIGN KEY ("file_public_id") REFERENCES "user_files"("public_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cleanup
DROP TABLE IF EXISTS folder_id_map;
