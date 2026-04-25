UPDATE "Conversation"
SET
  "automationStatus" = 'COMPLETED',
  "automationCompletedAt" = NOW(),
  "nextAutomationAt" = NULL,
  "mode" = 'AI',
  "updatedAt" = NOW()
WHERE
  "automationKind" = 'INITIAL_SEQUENCE'
  AND "automationStatus" = 'RUNNING'
  AND "nextAutomationAt" IS NULL
  AND "currentAutomationStepOrder" IS NOT NULL;