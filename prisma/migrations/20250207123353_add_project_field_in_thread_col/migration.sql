-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "project_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
