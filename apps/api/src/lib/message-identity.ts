type CampaignIdentityConfig = {
  enableMessageIdentity: boolean
  aiDisplayName: string | null
  enableAiPrefix: boolean
  enableAgentPrefix: boolean
  agentNameMode: 'FIRST_NAME' | 'FULL_NAME'
} | null | undefined

type SenderIdentity =
  | {
      senderType: 'AI'
    }
  | {
      senderType: 'AGENT'
      agentName?: string | null
    }

function getFirstName(name?: string | null) {
  const trimmed = name?.trim()

  if (!trimmed) return null

  return trimmed.split(/\s+/)[0] || null
}

function buildPrefix(
  campaign: CampaignIdentityConfig,
  sender: SenderIdentity
) {
  if (!campaign?.enableMessageIdentity) return null

  if (sender.senderType === 'AI') {
    if (!campaign.enableAiPrefix) return null

    const aiName = campaign.aiDisplayName?.trim()
    return aiName || null
  }

  if (!campaign.enableAgentPrefix) return null

  if (campaign.agentNameMode === 'FULL_NAME') {
    return sender.agentName?.trim() || null
  }

  return getFirstName(sender.agentName)
}

export function applyMessageIdentityPrefix(params: {
  text: string
  campaign: CampaignIdentityConfig
  sender: SenderIdentity
}) {
  const text = params.text.trim()
  const prefix = buildPrefix(params.campaign, params.sender)

  if (!prefix) return text

  return `${prefix}:\n${text}`
}