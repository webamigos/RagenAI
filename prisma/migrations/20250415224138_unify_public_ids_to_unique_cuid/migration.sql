/*
  Warnings:

  - A unique constraint covering the columns `[public_id]` on the table `UserDocument` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[public_id]` on the table `UserFile` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserDocument_public_id_key" ON "UserDocument"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserFile_public_id_key" ON "UserFile"("public_id");
