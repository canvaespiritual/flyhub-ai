BEGIN;

CREATE TABLE "CampaignDistributionRule" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'ROUND_ROBIN',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "reassignOnTimeout" BOOLEAN NOT NULL DEFAULT false,
  "responseTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
  "viewTimeoutSeconds" INTEGER,
  "onlyBusinessHours" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignDistributionRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignDistributionRule_campaignId_key"
  ON "CampaignDistributionRule"("campaignId");

CREATE INDEX "CampaignDistributionRule_managerId_isActive_idx"
  ON "CampaignDistributionRule"("managerId", "isActive");

CREATE INDEX "CampaignDistributionRule_mode_isActive_idx"
  ON "CampaignDistributionRule"("mode", "isActive");

ALTER TABLE "CampaignDistributionRule"
  ADD CONSTRAINT "CampaignDistributionRule_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignDistributionRule"
  ADD CONSTRAINT "CampaignDistributionRule_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CampaignDistributionMember" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignDistributionMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignDistributionMember_ruleId_userId_key"
  ON "CampaignDistributionMember"("ruleId", "userId");

CREATE UNIQUE INDEX "CampaignDistributionMember_ruleId_sortOrder_key"
  ON "CampaignDistributionMember"("ruleId", "sortOrder");

CREATE INDEX "CampaignDistributionMember_userId_isActive_idx"
  ON "CampaignDistributionMember"("userId", "isActive");

ALTER TABLE "CampaignDistributionMember"
  ADD CONSTRAINT "CampaignDistributionMember_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "CampaignDistributionRule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignDistributionMember"
  ADD CONSTRAINT "CampaignDistributionMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;