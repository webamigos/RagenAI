-- CreateTable
CREATE TABLE "Organization" (
    "id" INTEGER NOT NULL DEFAULT nextval('custom_id_seq'),
    "public_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL DEFAULT nextval('custom_id_seq'),
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "organization_id" INTEGER,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" INTEGER NOT NULL DEFAULT nextval('custom_id_seq'),
    "public_id" TEXT NOT NULL,
    "masked_value" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "project_id" INTEGER,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_public_id_provider_id_idx" ON "Organization"("public_id", "provider_id");

-- CreateIndex
CREATE INDEX "Project_public_id_idx" ON "Project"("public_id");

-- CreateIndex
CREATE INDEX "ApiKey_public_id_idx" ON "ApiKey"("public_id");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
