-- CreateTable
CREATE TABLE "chatbots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selected_file_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "widget_token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "allowed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "theme_config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chatbots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chatbot_id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chatbots_widget_token_key" ON "chatbots"("widget_token");

-- CreateIndex
CREATE INDEX "chatbots_organization_id_idx" ON "chatbots"("organization_id");

-- CreateIndex
CREATE INDEX "chatbots_widget_token_idx" ON "chatbots"("widget_token");

-- CreateIndex
CREATE INDEX "chatbot_conversations_chatbot_id_idx" ON "chatbot_conversations"("chatbot_id");

-- CreateIndex
CREATE INDEX "chatbot_conversations_session_id_idx" ON "chatbot_conversations"("session_id");

-- CreateIndex
CREATE INDEX "chatbot_messages_conversation_id_idx" ON "chatbot_messages"("conversation_id");

-- AddForeignKey
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
