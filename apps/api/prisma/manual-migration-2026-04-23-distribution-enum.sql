DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CampaignDistributionMode'
  ) THEN
    CREATE TYPE "CampaignDistributionMode" AS ENUM (
      'ROUND_ROBIN',
      'ORDERED_QUEUE',
      'MANUAL_ONLY',
      'QUEUE_WITH_TIMEOUT'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'CampaignDistributionRule'
      AND column_name = 'mode'
      AND udt_name <> 'CampaignDistributionMode'
  ) THEN
    ALTER TABLE "CampaignDistributionRule"
      ALTER COLUMN "mode" DROP DEFAULT;

    ALTER TABLE "CampaignDistributionRule"
      ALTER COLUMN "mode"
      TYPE "CampaignDistributionMode"
      USING "mode"::text::"CampaignDistributionMode";

    ALTER TABLE "CampaignDistributionRule"
      ALTER COLUMN "mode" SET DEFAULT 'ROUND_ROBIN';
  END IF;
END$$;