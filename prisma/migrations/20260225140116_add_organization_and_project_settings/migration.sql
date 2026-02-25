-- CreateTable
CREATE TABLE "organization_settings" (
    "id" UUID NOT NULL,
    "organization_id" INTEGER NOT NULL,
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organization_id_key" ON "organization_settings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_settings_project_id_key" ON "project_settings"("project_id");

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "internal_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
