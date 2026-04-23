BEGIN;

ALTER TABLE "Conversation"
  ADD COLUMN "queueCurrentUserId" TEXT,
  ADD COLUMN "queueStepStartedAt" TIMESTAMP(3),
  ADD COLUMN "queueStepExpiresAt" TIMESTAMP(3),
  ADD COLUMN "queueAttempt" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Conversation_queueCurrentUserId_idx"
  ON "Conversation"("queueCurrentUserId");

CREATE INDEX "Conversation_queueStepExpiresAt_idx"
  ON "Conversation"("queueStepExpiresAt");

CREATE INDEX "Conversation_tenantId_queueStepExpiresAt_idx"
  ON "Conversation"("tenantId", "queueStepExpiresAt");

COMMIT;