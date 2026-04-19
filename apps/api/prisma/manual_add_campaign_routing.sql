-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "managerId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "managerId" TEXT,
    "name" TEXT NOT NULL,
    "metaAdId" TEXT,
    "ref" TEXT,
    "fallbackText" TEXT,
    "initialPrompt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_tenantId_isActive_idx" ON "Campaign"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Campaign_phoneNumberId_isActive_idx" ON "Campaign"("phoneNumberId", "isActive");

-- CreateIndex
CREATE INDEX "Campaign_managerId_isActive_idx" ON "Campaign"("managerId", "isActive");

-- CreateIndex
CREATE INDEX "Campaign_metaAdId_idx" ON "Campaign"("metaAdId");

-- CreateIndex
CREATE INDEX "Campaign_ref_idx" ON "Campaign"("ref");

CREATE INDEX "Campaign_tenantId_metaAdId_idx" ON "Campaign"("tenantId", "metaAdId");

-- CreateIndex
CREATE INDEX "Conversation_campaignId_idx" ON "Conversation"("campaignId");

-- CreateIndex
CREATE INDEX "Conversation_managerId_updatedAt_idx" ON "Conversation"("managerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_managerId_status_updatedAt_idx" ON "Conversation"("tenantId", "managerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
