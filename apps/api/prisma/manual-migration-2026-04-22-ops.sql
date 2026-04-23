BEGIN;

ALTER TABLE "Tenant"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "timezone" TEXT DEFAULT 'America/Sao_Paulo';

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");

ALTER TABLE "PhoneNumber"
  ADD COLUMN "managerId" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "profileName" TEXT,
  ADD COLUMN "profileAbout" TEXT,
  ADD COLUMN "profileImageUrl" TEXT,
  ADD COLUMN "connectionStatus" TEXT NOT NULL DEFAULT 'DISCONNECTED';

ALTER TABLE "PhoneNumber"
  ADD CONSTRAINT "PhoneNumber_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PhoneNumber_tenantId_managerId_isActive_idx"
  ON "PhoneNumber"("tenantId", "managerId", "isActive");

CREATE TABLE "OperationSettings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "defaultSlaFirstResponseSec" INTEGER NOT NULL DEFAULT 300,
  "allowManagerManualAssign" BOOLEAN NOT NULL DEFAULT true,
  "allowAgentSelfAssign" BOOLEAN NOT NULL DEFAULT true,
  "autoAssignEnabled" BOOLEAN NOT NULL DEFAULT true,
  "autoAssignOnlyAgents" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationSettings_tenantId_key" ON "OperationSettings"("tenantId");

ALTER TABLE "OperationSettings"
  ADD CONSTRAINT "OperationSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OperationAiConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "defaultMode" TEXT NOT NULL DEFAULT 'AI',
  "promptBase" TEXT,
  "handoffPrompt" TEXT,
  "fallbackBehavior" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperationAiConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationAiConfig_tenantId_key" ON "OperationAiConfig"("tenantId");

ALTER TABLE "OperationAiConfig"
  ADD CONSTRAINT "OperationAiConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL DEFAULT 'pt_BR',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "providerTemplateId" TEXT,
  "headerText" TEXT,
  "bodyText" TEXT NOT NULL,
  "footerText" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageTemplate_tenantId_category_isActive_idx"
  ON "MessageTemplate"("tenantId", "category", "isActive");

CREATE INDEX "MessageTemplate_tenantId_status_createdAt_idx"
  ON "MessageTemplate"("tenantId", "status", "createdAt");

ALTER TABLE "MessageTemplate"
  ADD CONSTRAINT "MessageTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageTemplate"
  ADD CONSTRAINT "MessageTemplate_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Broadcast" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "templateId" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "audienceFilter" JSONB,
  "messageBody" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Broadcast_tenantId_status_createdAt_idx"
  ON "Broadcast"("tenantId", "status", "createdAt");

CREATE INDEX "Broadcast_tenantId_scheduledAt_idx"
  ON "Broadcast"("tenantId", "scheduledAt");

ALTER TABLE "Broadcast"
  ADD CONSTRAINT "Broadcast_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Broadcast"
  ADD CONSTRAINT "Broadcast_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Broadcast"
  ADD CONSTRAINT "Broadcast_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;