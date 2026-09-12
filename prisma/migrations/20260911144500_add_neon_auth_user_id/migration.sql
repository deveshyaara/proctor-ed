-- AlterTable
ALTER TABLE "users" ADD COLUMN     "neonAuthUserId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_neonAuthUserId_key" ON "users"("neonAuthUserId");

-- CreateIndex
CREATE INDEX "users_neonAuthUserId_idx" ON "users"("neonAuthUserId");
