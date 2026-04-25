CREATE TYPE "AiResourceType" AS ENUM (
  'LINK',
  'AUDIO',
  'VIDEO',
  'IMAGE',
  'PDF',
  'DOCUMENT',
  'TEXT'
);

CREATE TYPE "AiKnowledgeTableType" AS ENUM (
  'SIMULATION',
  'DOCUMENTS',
  'PRICING',
  'FAQ',
  'CUSTOM'
);

CREATE TYPE "AiFollowupWindowType" AS ENUM (
  'SERVICE_24H',
  'ENTRY_POINT_72H',
  'TEMPLATE_AFTER_WINDOW'
);

CREATE TYPE "AiPromptVersionStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
);

CREATE TABLE "AiAgent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  "maxContextMessages" INTEGER NOT NULL DEFAULT 12,
  "objective" TEXT,
  "tone" TEXT,
  "basePrompt" TEXT,
  "safetyRules" TEXT,
  "handoffRules" TEXT,
  "businessRules" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiStage" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "objective" TEXT,
  "instructions" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AiStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiObjection" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "stageId" TEXT,
  "title" TEXT NOT NULL,
  "triggers" TEXT,
  "response" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AiObjection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiResource" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "type" "AiResourceType" NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AiResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiKnowledgeTable" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AiKnowledgeTableType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AiKnowledgeTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiKnowledgeRow" (
  "id" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  CONSTRAINT "AiKnowledgeRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiFollowupRule" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "delayMinutes" INTEGER NOT NULL,
  "message" TEXT NOT NULL,
  "windowType" "AiFollowupWindowType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AiFollowupRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSuccessExample" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "transcript" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "AiSuccessExample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPromptVersion" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" "AiPromptVersionStatus" NOT NULL DEFAULT 'DRAFT',
  CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignAiConfig" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  CONSTRAINT "CampaignAiConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationAiState" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "currentStageId" TEXT,
  "contextSummary" TEXT,
  CONSTRAINT "ConversationAiState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAgent_tenantId_slug_key" ON "AiAgent"("tenantId", "slug");
CREATE INDEX "AiAgent_tenantId_isActive_idx" ON "AiAgent"("tenantId", "isActive");

CREATE INDEX "AiStage_agentId_order_idx" ON "AiStage"("agentId", "order");

CREATE INDEX "AiObjection_agentId_isActive_idx" ON "AiObjection"("agentId", "isActive");
CREATE INDEX "AiObjection_stageId_idx" ON "AiObjection"("stageId");

CREATE INDEX "AiResource_agentId_isActive_idx" ON "AiResource"("agentId", "isActive");

CREATE INDEX "AiKnowledgeTable_agentId_isActive_idx" ON "AiKnowledgeTable"("agentId", "isActive");
CREATE INDEX "AiKnowledgeRow_tableId_idx" ON "AiKnowledgeRow"("tableId");

CREATE INDEX "AiFollowupRule_agentId_isActive_idx" ON "AiFollowupRule"("agentId", "isActive");

CREATE INDEX "AiSuccessExample_agentId_isActive_idx" ON "AiSuccessExample"("agentId", "isActive");

CREATE INDEX "AiPromptVersion_agentId_status_idx" ON "AiPromptVersion"("agentId", "status");

CREATE UNIQUE INDEX "CampaignAiConfig_campaignId_key" ON "CampaignAiConfig"("campaignId");

CREATE UNIQUE INDEX "ConversationAiState_conversationId_key" ON "ConversationAiState"("conversationId");
CREATE INDEX "ConversationAiState_agentId_idx" ON "ConversationAiState"("agentId");
CREATE INDEX "ConversationAiState_currentStageId_idx" ON "ConversationAiState"("currentStageId");

ALTER TABLE "AiAgent"
ADD CONSTRAINT "AiAgent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiStage"
ADD CONSTRAINT "AiStage_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiObjection"
ADD CONSTRAINT "AiObjection_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiResource"
ADD CONSTRAINT "AiResource_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiKnowledgeTable"
ADD CONSTRAINT "AiKnowledgeTable_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiKnowledgeRow"
ADD CONSTRAINT "AiKnowledgeRow_tableId_fkey"
FOREIGN KEY ("tableId") REFERENCES "AiKnowledgeTable"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiFollowupRule"
ADD CONSTRAINT "AiFollowupRule_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSuccessExample"
ADD CONSTRAINT "AiSuccessExample_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiPromptVersion"
ADD CONSTRAINT "AiPromptVersion_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignAiConfig"
ADD CONSTRAINT "CampaignAiConfig_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignAiConfig"
ADD CONSTRAINT "CampaignAiConfig_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationAiState"
ADD CONSTRAINT "ConversationAiState_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationAiState"
ADD CONSTRAINT "ConversationAiState_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;