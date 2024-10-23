-- AlterTable
ALTER TABLE "ApiKey" ALTER COLUMN "id" SET DEFAULT nextval('custom_id_seq'),
ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "custom_id_seq";

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "id" SET DEFAULT nextval('custom_id_seq'),
ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "custom_id_seq";

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "id" SET DEFAULT nextval('custom_id_seq'),
ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "custom_id_seq";
