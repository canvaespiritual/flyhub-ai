-- Dynamic lead fields, tags and extractor foundation

CREATE TYPE "LeadFieldType" AS ENUM (
  'TEXT',
  'NUMBER',
  'MONEY',
  'BOOLEAN',
  'DATE',
  'SELECT',
  'MULTI_SELECT',
  'PHONE',
  'EMAIL',
  'URL',
  'JSON'
);

CREATE TYPE "LeadFieldSourceMode" AS ENUM (
  'SYSTEM',
  'AI',
  'HUMAN',
  'AI_HUMAN',
  'SYSTEM_HUMAN'
);

CREATE TYPE "LeadFieldValueSource" AS ENUM (
  'SYSTEM',
  'AI',
  'HUMAN'
);

CREATE TYPE "LeadExtractionStatus" AS ENUM (
  'SUCCESS',
  'FAILED',
  'SKIPPED'
);

CREATE TABLE "LeadFieldDefinition" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "type" "LeadFieldType" NOT NULL,
  "sourceMode" "LeadFieldSourceMode" NOT NULL DEFAULT 'HUMAN',
  "options" JSONB,
  "defaultValue" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isFilterable" BOOLEAN NOT NULL DEFAULT true,
  "isVisibleOnCard" BOOLEAN NOT NULL DEFAULT true,
  "isSensitive" BOOLEAN NOT NULL DEFAULT false,
  "aiExtractable" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationFieldValue" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "value" JSONB,
  "displayValue" TEXT,
  "source" "LeadFieldValueSource" NOT NULL,
  "confidence" DOUBLE PRECISION,
  "evidence" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationFieldAuditLog" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "source" "LeadFieldValueSource" NOT NULL,
  "changedByUserId" TEXT,
  "evidence" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationFieldAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadTag" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "color" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationTag" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "source" "LeadFieldValueSource" NOT NULL DEFAULT 'HUMAN',
  "addedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadExtractorConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "model" TEXT NOT NULL DEFAULT 'gpt-5-chat-latest',
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maxMessages" INTEGER NOT NULL DEFAULT 20,
  "customPrompt" TEXT,
  "runOnInbound" BOOLEAN NOT NULL DEFAULT true,
  "runOnOutbound" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadExtractorConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadExtractionRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "status" "LeadExtractionStatus" NOT NULL,
  "inputMessageIds" JSONB,
  "extractedData" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadExtractionRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadFieldDefinition_tenantId_key_key"
  ON "LeadFieldDefinition"("tenantId", "key");

CREATE INDEX "LeadFieldDefinition_tenantId_isActive_order_idx"
  ON "LeadFieldDefinition"("tenantId", "isActive", "order");

CREATE INDEX "LeadFieldDefinition_tenantId_isFilterable_idx"
  ON "LeadFieldDefinition"("tenantId", "isFilterable");

CREATE UNIQUE INDEX "ConversationFieldValue_conversationId_fieldId_key"
  ON "ConversationFieldValue"("conversationId", "fieldId");

CREATE INDEX "ConversationFieldValue_conversationId_idx"
  ON "ConversationFieldValue"("conversationId");

CREATE INDEX "ConversationFieldValue_fieldId_idx"
  ON "ConversationFieldValue"("fieldId");

CREATE INDEX "ConversationFieldValue_updatedByUserId_idx"
  ON "ConversationFieldValue"("updatedByUserId");

CREATE INDEX "ConversationFieldValue_source_idx"
  ON "ConversationFieldValue"("source");

CREATE INDEX "ConversationFieldAuditLog_conversationId_createdAt_idx"
  ON "ConversationFieldAuditLog"("conversationId", "createdAt");

CREATE INDEX "ConversationFieldAuditLog_fieldId_createdAt_idx"
  ON "ConversationFieldAuditLog"("fieldId", "createdAt");

CREATE INDEX "ConversationFieldAuditLog_changedByUserId_idx"
  ON "ConversationFieldAuditLog"("changedByUserId");

CREATE INDEX "ConversationFieldAuditLog_source_idx"
  ON "ConversationFieldAuditLog"("source");

CREATE UNIQUE INDEX "LeadTag_tenantId_slug_key"
  ON "LeadTag"("tenantId", "slug");

CREATE INDEX "LeadTag_tenantId_isActive_idx"
  ON "LeadTag"("tenantId", "isActive");

CREATE UNIQUE INDEX "ConversationTag_conversationId_tagId_key"
  ON "ConversationTag"("conversationId", "tagId");

CREATE INDEX "ConversationTag_conversationId_idx"
  ON "ConversationTag"("conversationId");

CREATE INDEX "ConversationTag_tagId_idx"
  ON "ConversationTag"("tagId");

CREATE INDEX "ConversationTag_addedByUserId_idx"
  ON "ConversationTag"("addedByUserId");

CREATE INDEX "ConversationTag_source_idx"
  ON "ConversationTag"("source");

CREATE UNIQUE INDEX "LeadExtractorConfig_tenantId_key"
  ON "LeadExtractorConfig"("tenantId");

CREATE INDEX "LeadExtractionRun_tenantId_createdAt_idx"
  ON "LeadExtractionRun"("tenantId", "createdAt");

CREATE INDEX "LeadExtractionRun_conversationId_createdAt_idx"
  ON "LeadExtractionRun"("conversationId", "createdAt");

CREATE INDEX "LeadExtractionRun_status_createdAt_idx"
  ON "LeadExtractionRun"("status", "createdAt");

ALTER TABLE "LeadFieldDefinition"
  ADD CONSTRAINT "LeadFieldDefinition_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationFieldValue"
  ADD CONSTRAINT "ConversationFieldValue_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationFieldValue"
  ADD CONSTRAINT "ConversationFieldValue_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "LeadFieldDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationFieldValue"
  ADD CONSTRAINT "ConversationFieldValue_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationFieldAuditLog"
  ADD CONSTRAINT "ConversationFieldAuditLog_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationFieldAuditLog"
  ADD CONSTRAINT "ConversationFieldAuditLog_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "LeadFieldDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationFieldAuditLog"
  ADD CONSTRAINT "ConversationFieldAuditLog_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadTag"
  ADD CONSTRAINT "LeadTag_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationTag"
  ADD CONSTRAINT "ConversationTag_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationTag"
  ADD CONSTRAINT "ConversationTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "LeadTag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationTag"
  ADD CONSTRAINT "ConversationTag_addedByUserId_fkey"
  FOREIGN KEY ("addedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadExtractorConfig"
  ADD CONSTRAINT "LeadExtractorConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadExtractionRun"
  ADD CONSTRAINT "LeadExtractionRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadExtractionRun"
  ADD CONSTRAINT "LeadExtractionRun_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;