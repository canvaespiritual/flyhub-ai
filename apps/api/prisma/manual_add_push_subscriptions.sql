CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,

  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,

  "userAgent" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key"
ON "PushSubscription"("endpoint");

CREATE INDEX "PushSubscription_tenantId_userId_enabled_idx"
ON "PushSubscription"("tenantId", "userId", "enabled");

CREATE INDEX "PushSubscription_userId_enabled_idx"
ON "PushSubscription"("userId", "enabled");

CREATE INDEX "PushSubscription_tenantId_enabled_idx"
ON "PushSubscription"("tenantId", "enabled");

ALTER TABLE "PushSubscription"
ADD CONSTRAINT "PushSubscription_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "Tenant"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "PushSubscription"
ADD CONSTRAINT "PushSubscription_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;