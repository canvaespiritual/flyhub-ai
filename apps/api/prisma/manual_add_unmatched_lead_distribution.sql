CREATE TABLE "UnmatchedLeadDistributionRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "mode" "CampaignDistributionMode" NOT NULL DEFAULT 'ROUND_ROBIN',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "reassignOnTimeout" BOOLEAN NOT NULL DEFAULT false,
  "responseTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
  "viewTimeoutSeconds" INTEGER,
  "onlyBusinessHours" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UnmatchedLeadDistributionRule_pkey"
  PRIMARY KEY ("id")
);

CREATE TABLE "UnmatchedLeadDistributionMember" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "shiftStartHour" INTEGER,
  "shiftEndHour" INTEGER,
  "shiftDays" INTEGER[],
  "timezone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UnmatchedLeadDistributionMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnmatchedLeadDistributionRule_tenantId_key"
ON "UnmatchedLeadDistributionRule"("tenantId");

CREATE INDEX "UnmatchedLeadDistributionRule_tenantId_isActive_idx"
ON "UnmatchedLeadDistributionRule"("tenantId", "isActive");

CREATE INDEX "UnmatchedLeadDistributionRule_mode_isActive_idx"
ON "UnmatchedLeadDistributionRule"("mode", "isActive");

CREATE UNIQUE INDEX "UnmatchedLeadDistributionMember_ruleId_userId_key"
ON "UnmatchedLeadDistributionMember"("ruleId", "userId");

CREATE UNIQUE INDEX "UnmatchedLeadDistributionMember_ruleId_sortOrder_key"
ON "UnmatchedLeadDistributionMember"("ruleId", "sortOrder");

CREATE INDEX "UnmatchedLeadDistributionMember_userId_isActive_idx"
ON "UnmatchedLeadDistributionMember"("userId", "isActive");

ALTER TABLE "UnmatchedLeadDistributionRule"
ADD CONSTRAINT "UnmatchedLeadDistributionRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnmatchedLeadDistributionMember"
ADD CONSTRAINT "UnmatchedLeadDistributionMember_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "UnmatchedLeadDistributionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnmatchedLeadDistributionMember"
ADD CONSTRAINT "UnmatchedLeadDistributionMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;