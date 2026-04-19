import { prisma } from './prisma.js'

type ResolveCampaignInput = {
  tenantId: string
  phoneNumberId: string
  referralSourceId?: string | null
  referralRef?: string | null
  inboundText?: string | null
}

export async function resolveCampaignFromInbound(input: ResolveCampaignInput) {
  const {
    tenantId,
    phoneNumberId,
    referralSourceId,
    referralRef,
    inboundText
  } = input

  const normalizedText = inboundText?.trim().toLowerCase()

  if (referralSourceId) {
    const byMetaAdId = await prisma.campaign.findFirst({
      where: {
        tenantId,
        phoneNumberId,
        isActive: true,
        metaAdId: referralSourceId
      }
    })

    if (byMetaAdId) return byMetaAdId
  }

  if (referralRef) {
    const byRef = await prisma.campaign.findFirst({
      where: {
        tenantId,
        phoneNumberId,
        isActive: true,
        ref: referralRef
      }
    })

    if (byRef) return byRef
  }

  if (normalizedText) {
    const campaignsWithFallback = await prisma.campaign.findMany({
      where: {
        tenantId,
        phoneNumberId,
        isActive: true,
        fallbackText: {
          not: null
        }
      },
      select: {
        id: true,
        tenantId: true,
        phoneNumberId: true,
        managerId: true,
        name: true,
        metaAdId: true,
        ref: true,
        fallbackText: true,
        initialPrompt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })

    const matched = campaignsWithFallback.find((campaign) => {
      const fallback = campaign.fallbackText?.trim().toLowerCase()
      return fallback && normalizedText.includes(fallback)
    })

    if (matched) return matched
  }

  return null
}