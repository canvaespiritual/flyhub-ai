DO $$ BEGIN
  CREATE TYPE "PhoneNumberConnectionStatus" AS ENUM (
    'CONNECTED',
    'DISCONNECTED',
    'PENDING'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
CREATE TABLE "WhatsAppConnection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" "MessageProvider" NOT NULL DEFAULT 'WHATSAPP_CLOUD',
  "wabaId" TEXT NOT NULL,
  "accessToken" TEXT,
  "tokenLastUpdatedAt" TIMESTAMP(3),
  "status" "PhoneNumberConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WhatsAppConnection"
ADD CONSTRAINT "WhatsAppConnection_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "WhatsAppConnection_tenantId_wabaId_key"
ON "WhatsAppConnection"("tenantId", "wabaId");

CREATE INDEX "WhatsAppConnection_tenantId_isDefault_idx"
ON "WhatsAppConnection"("tenantId", "isDefault");

CREATE INDEX "WhatsAppConnection_wabaId_idx"
ON "WhatsAppConnection"("wabaId");

ALTER TABLE "PhoneNumber"
ADD COLUMN "whatsappConnectionId" TEXT;

ALTER TABLE "PhoneNumber"
ADD CONSTRAINT "PhoneNumber_whatsappConnectionId_fkey"
FOREIGN KEY ("whatsappConnectionId") REFERENCES "WhatsAppConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PhoneNumber_whatsappConnectionId_idx"
ON "PhoneNumber"("whatsappConnectionId");