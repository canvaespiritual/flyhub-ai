-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('LEAD', 'AGENT', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'DOCUMENT');

-- AlterTable
ALTER TABLE "Message"
ADD COLUMN "durationSeconds" INTEGER,
ADD COLUMN "fileName" TEXT,
ADD COLUMN "mediaUrl" TEXT,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "senderType" "MessageSenderType",
ADD COLUMN "type" "MessageType",
ALTER COLUMN "content" DROP NOT NULL;

-- Backfill existing rows using old direction
UPDATE "Message"
SET "senderType" = CASE
  WHEN "direction" = 'INBOUND' THEN 'LEAD'::"MessageSenderType"
  WHEN "direction" = 'OUTBOUND' THEN 'AGENT'::"MessageSenderType"
  ELSE 'SYSTEM'::"MessageSenderType"
END
WHERE "senderType" IS NULL;

UPDATE "Message"
SET "type" = 'TEXT'::"MessageType"
WHERE "type" IS NULL;

-- Make new columns required only after backfill
ALTER TABLE "Message"
ALTER COLUMN "senderType" SET NOT NULL,
ALTER COLUMN "type" SET NOT NULL;

-- Drop old column after migration is complete
ALTER TABLE "Message"
DROP COLUMN "direction";

-- DropEnum
DROP TYPE "MessageDirection";