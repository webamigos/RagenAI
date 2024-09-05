-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "User" (
    "_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Message" (
    "_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "openai_message_id" TEXT NOT NULL,
    "openai_created_at" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "thread_id" TEXT,
    "visitor_id" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "FlaggedMessage" (
    "_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "FlaggedMessage_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "_id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "openai_thread_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "VisitorMessages" (
    "_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorMessages_pkey" PRIMARY KEY ("_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Message_public_id_key" ON "Message"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "FlaggedMessage_public_id_key" ON "FlaggedMessage"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "Thread_public_id_key" ON "Thread"("public_id");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "Thread"("_id") ON DELETE SET NULL ON UPDATE CASCADE;
