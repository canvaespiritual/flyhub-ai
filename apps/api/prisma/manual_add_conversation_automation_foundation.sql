DO $$ BEGIN
  CREATE TYPE "CampaignStepType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'LINK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CampaignFollowUpTriggerType" AS ENUM ('AFTER_LAST_INBOUND', 'AFTER_LAST_INTERACTION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationAutomationKind" AS ENUM ('INITIAL_SEQUENCE', 'FOLLOW_UP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationAutomationStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CampaignInitialStep" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "type" "CampaignStepType" NOT NULL,
  "content" TEXT NOT NULL,
  "delaySeconds" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignInitialStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CampaignFollowUpRule" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "triggerType" "CampaignFollowUpTriggerType" NOT NULL,
  "delaySeconds" INTEGER NOT NULL,
  "type" "CampaignStepType" NOT NULL,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignFollowUpRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "automationKind" "ConversationAutomationKind",
  ADD COLUMN IF NOT EXISTS "automationStatus" "ConversationAutomationStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN IF NOT EXISTS "automationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "currentAutomationStepOrder" INTEGER,
  ADD COLUMN IF NOT EXISTS "automationStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "automationCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "automationCancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAutomationDispatchAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nextAutomationAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "CampaignInitialStep"
    ADD CONSTRAINT "CampaignInitialStep_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CampaignFollowUpRule"
    ADD CONSTRAINT "CampaignFollowUpRule_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignInitialStep_campaignId_order_key"
  ON "CampaignInitialStep"("campaignId", "order");

CREATE INDEX IF NOT EXISTS "CampaignInitialStep_campaignId_isActive_order_idx"
  ON "CampaignInitialStep"("campaignId", "isActive", "order");

CREATE INDEX IF NOT EXISTS "CampaignFollowUpRule_campaignId_isActive_idx"
  ON "CampaignFollowUpRule"("campaignId", "isActive");

CREATE INDEX IF NOT EXISTS "CampaignFollowUpRule_campaignId_triggerType_isActive_idx"
  ON "CampaignFollowUpRule"("campaignId", "triggerType", "isActive");

CREATE INDEX IF NOT EXISTS "Conversation_automationStatus_nextAutomationAt_idx"
  ON "Conversation"("automationStatus", "nextAutomationAt");

CREATE INDEX IF NOT EXISTS "Conversation_tenantId_automationStatus_nextAutomationAt_idx"
  ON "Conversation"("tenantId", "automationStatus", "nextAutomationAt");

CREATE INDEX IF NOT EXISTS "Conversation_tenantId_mode_automationStatus_nextAutomationAt_idx"
  ON "Conversation"("tenantId", "mode", "automationStatus", "nextAutomationAt");

CREATE INDEX IF NOT EXISTS "Conversation_tenantId_campaignId_automationStatus_idx"
  ON "Conversation"("tenantId", "campaignId", "automationStatus");