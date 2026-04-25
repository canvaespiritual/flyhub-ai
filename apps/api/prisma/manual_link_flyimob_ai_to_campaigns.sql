INSERT INTO "CampaignAiConfig" (
  "id",
  "campaignId",
  "agentId"
)
SELECT
  'campaign_ai_' || c."id",
  c."id",
  a."id"
FROM "Campaign" c
JOIN "AiAgent" a
  ON a."tenantId" = c."tenantId"
WHERE a."slug" = 'flyimob-imobiliario-v1'
ON CONFLICT ("campaignId") DO NOTHING;