import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionFromRequest } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

const phoneNumberParamsSchema = z.object({
  id: z.string().min(1)
})

const createPhoneNumberSchema = z.object({
  number: z.string().trim().min(8).max(30),
  label: z.string().trim().max(120).nullable().optional(),
  managerId: z.string().min(1).nullable().optional(),
  providerAccountId: z.string().trim().min(5).max(120),
    externalId: z.string().trim().min(5).max(120),
    accessToken: z.string().trim().min(20).max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional()
})

const updatePhoneNumberSchema = z.object({
  number: z.string().trim().min(8).max(30).optional(),
  label: z.string().trim().max(120).nullable().optional(),
  managerId: z.string().min(1).nullable().optional(),
  providerAccountId: z.string().trim().min(5).max(120).optional(),
    externalId: z.string().trim().min(5).max(120).optional(),
    accessToken: z.string().trim().min(20).max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional()
})

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeNullableString(value?: string | null) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function serializePhoneNumber(phoneNumber: {
  id: string
  number: string
  label: string | null
  tenantId: string
  managerId: string | null
  provider: 'WHATSAPP_CLOUD' | 'INSTAGRAM' | 'FACEBOOK' | 'INTERNAL'
  providerAccountId: string | null
  externalId: string | null
  isActive: boolean
  isDefault: boolean
  profileName: string | null
  profileAbout: string | null
  profileImageUrl: string | null
  connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
  createdAt: Date
  updatedAt: Date
  manager?: {
    id: string
    name: string
    email: string
    role: 'MASTER' | 'ADMIN' | 'MANAGER' | 'AGENT'
  } | null
  _count?: {
    campaigns: number
    conversations: number
  }
  whatsappConnection?: {
  id: string
  wabaId: string
  accessToken: string | null
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
} | null
}) {
  return {
    id: phoneNumber.id,
    number: phoneNumber.number,
    label: phoneNumber.label ?? undefined,
    tenantId: phoneNumber.tenantId,
    managerId: phoneNumber.managerId ?? undefined,
    provider: phoneNumber.provider.toLowerCase(),
    providerAccountId: phoneNumber.providerAccountId ?? undefined,
    externalId: phoneNumber.externalId ?? undefined,
    isActive: phoneNumber.isActive,
    isDefault: phoneNumber.isDefault,
    profileName: phoneNumber.profileName ?? undefined,
    profileAbout: phoneNumber.profileAbout ?? undefined,
    profileImageUrl: phoneNumber.profileImageUrl ?? undefined,
    connectionStatus: phoneNumber.connectionStatus.toLowerCase(),
    whatsappConnectionId: phoneNumber.whatsappConnection?.id ?? undefined,
    wabaId: phoneNumber.whatsappConnection?.wabaId ?? phoneNumber.providerAccountId ?? undefined,
    hasAccessToken: Boolean(phoneNumber.whatsappConnection?.accessToken),
    whatsappConnectionStatus:
    phoneNumber.whatsappConnection?.status.toLowerCase() ?? undefined,
    createdAt: phoneNumber.createdAt.toISOString(),
    updatedAt: phoneNumber.updatedAt.toISOString(),
    manager: phoneNumber.manager
      ? {
          id: phoneNumber.manager.id,
          name: phoneNumber.manager.name,
          email: phoneNumber.manager.email,
          role: phoneNumber.manager.role.toLowerCase()
        }
      : undefined,
    campaignsCount: phoneNumber._count?.campaigns ?? 0,
    conversationsCount: phoneNumber._count?.conversations ?? 0
  }
}

export async function phoneNumberRoutes(app: FastifyInstance) {
  app.get('/phone-numbers', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const currentUserId = session.user.id

    if (currentUserRole === 'AGENT') {
      return reply.status(403).send({
        message: 'Sem permissão para listar números'
      })
    }

    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: {
        tenantId,
        ...(currentUserRole === 'MANAGER'
          ? {
              OR: [{ managerId: currentUserId }, { managerId: null }]
            }
          : {})
      },
      include: {
        whatsappConnection: {
        select: {
            id: true,
            wabaId: true,
            accessToken: true,
            status: true
        }
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        _count: {
          select: {
            campaigns: true,
            conversations: true
          }
        }
      },
      orderBy: [
        { isDefault: 'desc' },
        { isActive: 'desc' },
        { label: 'asc' },
        { number: 'asc' }
      ]
    })

    return phoneNumbers.map(serializePhoneNumber)
  })

  app.get('/phone-numbers/options', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const tenantId = session.user.tenantId
    const currentUserRole = session.user.role
    const currentUserId = session.user.id

    if (currentUserRole === 'AGENT') {
      return reply.status(403).send({
        message: 'Sem permissão para listar opções de números'
      })
    }

    const managers = await prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: 'MANAGER',
        ...(currentUserRole === 'MANAGER' ? { id: currentUserId } : {})
      },
      select: {
        id: true,
        name: true,
        email: true
      },
      orderBy: [{ name: 'asc' }]
    })

    return {
      managers
    }
  })

  app.post('/phone-numbers', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const currentUserRole = session.user.role
    const tenantId = session.user.tenantId
    const currentUserId = session.user.id

    if (
      currentUserRole !== 'MASTER' &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'MANAGER'
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para cadastrar número'
      })
    }

    const parsedBody = createPhoneNumberSchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const {
  number,
  label,
  managerId,
  providerAccountId,
  externalId,
  accessToken,
  isActive,
  isDefault
} = parsedBody.data

    const normalizedNumber = normalizePhone(number)
    const normalizedExternalId = externalId.trim()
    const normalizedProviderAccountId = normalizeNullableString(providerAccountId)

    let resolvedManagerId: string | null = managerId ?? null

    if (currentUserRole === 'MANAGER') {
      resolvedManagerId = currentUserId
    }

    if (resolvedManagerId) {
      const manager = await prisma.user.findFirst({
        where: {
          id: resolvedManagerId,
          tenantId,
          isActive: true,
          role: 'MANAGER'
        },
        select: {
          id: true
        }
      })

      if (!manager) {
        return reply.status(404).send({
          message: 'Manager not found'
        })
      }
    }

    const existingByNumber = await prisma.phoneNumber.findUnique({
      where: {
        number: normalizedNumber
      },
      select: {
        id: true
      }
    })

    if (existingByNumber) {
      return reply.status(409).send({
        message: 'Já existe um número cadastrado com esse telefone'
      })
    }

    const existingByExternalId = await prisma.phoneNumber.findFirst({
      where: {
        provider: 'WHATSAPP_CLOUD',
        externalId: normalizedExternalId
      },
      select: {
        id: true
      }
    })

    if (existingByExternalId) {
      return reply.status(409).send({
        message: 'Já existe um número cadastrado com esse phone_number_id da Meta'
      })
    }

    const phoneNumber = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.phoneNumber.updateMany({
          where: {
            tenantId,
            isDefault: true
          },
          data: {
            isDefault: false
          }
        })
      }
      const whatsappConnection = await tx.whatsAppConnection.upsert({
  where: {
    tenantId_wabaId: {
      tenantId,
      wabaId: normalizedProviderAccountId!
    }
  },
  update: {
    name: normalizeNullableString(label) ?? normalizedProviderAccountId!,
    ...(accessToken !== undefined
      ? {
          accessToken: normalizeNullableString(accessToken),
          tokenLastUpdatedAt: accessToken ? new Date() : undefined
        }
      : {}),
    status: 'CONNECTED'
  },
  create: {
    tenantId,
    name: normalizeNullableString(label) ?? normalizedProviderAccountId!,
    wabaId: normalizedProviderAccountId!,
    accessToken: normalizeNullableString(accessToken),
    tokenLastUpdatedAt: accessToken ? new Date() : null,
    status: 'CONNECTED',
    isDefault: false
  }
})
      return tx.phoneNumber.create({
        data: {
          tenantId,
          number: normalizedNumber,
          label: normalizeNullableString(label),
          managerId: resolvedManagerId,
          provider: 'WHATSAPP_CLOUD',
          providerAccountId: normalizedProviderAccountId,
          whatsappConnectionId: whatsappConnection.id,
          externalId: normalizedExternalId,
          isActive: isActive ?? true,
          isDefault: isDefault ?? false,
          connectionStatus: 'CONNECTED'
        },
        include: {
            whatsappConnection: {
            select: {
                id: true,
                wabaId: true,
                accessToken: true,
                status: true
            }
            },
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          _count: {
            select: {
              campaigns: true,
              conversations: true
            }
          }
        }
      })
    })

    return reply.status(201).send(serializePhoneNumber(phoneNumber))
  })

  app.patch('/phone-numbers/:id', async (request, reply) => {
    const session = await getSessionFromRequest(request)

    if (!session) {
      return reply.status(401).send({
        message: 'Não autenticado'
      })
    }

    const currentUserRole = session.user.role
    const tenantId = session.user.tenantId
    const currentUserId = session.user.id

    if (
      currentUserRole !== 'MASTER' &&
      currentUserRole !== 'ADMIN' &&
      currentUserRole !== 'MANAGER'
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para editar número'
      })
    }

    const parsedParams = phoneNumberParamsSchema.safeParse(request.params)

    if (!parsedParams.success) {
      return reply.status(400).send({
        message: 'Invalid phone number id'
      })
    }

    const parsedBody = updatePhoneNumberSchema.safeParse(request.body)

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Dados inválidos',
        issues: parsedBody.error.flatten()
      })
    }

    const { id } = parsedParams.data
    const data = parsedBody.data

    const existingPhoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true,
        managerId: true
      }
    })

    if (!existingPhoneNumber) {
      return reply.status(404).send({
        message: 'Phone number not found'
      })
    }

    if (
      currentUserRole === 'MANAGER' &&
      existingPhoneNumber.managerId &&
      existingPhoneNumber.managerId !== currentUserId
    ) {
      return reply.status(403).send({
        message: 'Sem permissão para editar número de outro manager'
      })
    }

    let resolvedManagerId =
      data.managerId === undefined ? undefined : data.managerId

    if (currentUserRole === 'MANAGER') {
      resolvedManagerId = currentUserId
    }

    if (resolvedManagerId) {
      const manager = await prisma.user.findFirst({
        where: {
          id: resolvedManagerId,
          tenantId,
          isActive: true,
          role: 'MANAGER'
        },
        select: {
          id: true
        }
      })

      if (!manager) {
        return reply.status(404).send({
          message: 'Manager not found'
        })
      }
    }

    const normalizedNumber =
      data.number !== undefined ? normalizePhone(data.number) : undefined

    const normalizedExternalId =
      data.externalId !== undefined ? data.externalId.trim() : undefined

      const normalizedProviderAccountId =
  data.providerAccountId !== undefined
    ? normalizeNullableString(data.providerAccountId)
    : undefined

const normalizedAccessToken =
  data.accessToken !== undefined
    ? normalizeNullableString(data.accessToken)
    : undefined

    if (normalizedNumber) {
      const existingByNumber = await prisma.phoneNumber.findFirst({
        where: {
          number: normalizedNumber,
          NOT: {
            id
          }
        },
        select: {
          id: true
        }
      })

      if (existingByNumber) {
        return reply.status(409).send({
          message: 'Já existe outro número cadastrado com esse telefone'
        })
      }
    }

    if (normalizedExternalId) {
      const existingByExternalId = await prisma.phoneNumber.findFirst({
        where: {
          provider: 'WHATSAPP_CLOUD',
          externalId: normalizedExternalId,
          NOT: {
            id
          }
        },
        select: {
          id: true
        }
      })

      if (existingByExternalId) {
        return reply.status(409).send({
          message: 'Já existe outro número cadastrado com esse phone_number_id da Meta'
        })
      }
    }

    const phoneNumber = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.phoneNumber.updateMany({
          where: {
            tenantId,
            isDefault: true,
            NOT: {
              id
            }
          },
          data: {
            isDefault: false
          }
        })
      }
      let whatsappConnectionId: string | undefined

if (normalizedProviderAccountId) {
  const whatsappConnection = await tx.whatsAppConnection.upsert({
    where: {
      tenantId_wabaId: {
        tenantId,
        wabaId: normalizedProviderAccountId
      }
    },
    update: {
      ...(data.label !== undefined
        ? { name: normalizeNullableString(data.label) ?? normalizedProviderAccountId }
        : {}),
      ...(data.accessToken !== undefined
        ? {
            accessToken: normalizedAccessToken,
            tokenLastUpdatedAt: normalizedAccessToken ? new Date() : null
          }
        : {}),
      status: 'CONNECTED'
    },
    create: {
      tenantId,
      name: normalizeNullableString(data.label) ?? normalizedProviderAccountId,
      wabaId: normalizedProviderAccountId,
      accessToken: normalizedAccessToken,
      tokenLastUpdatedAt: normalizedAccessToken ? new Date() : null,
      status: 'CONNECTED',
      isDefault: false
    }
  })

  whatsappConnectionId = whatsappConnection.id
}
      return tx.phoneNumber.update({
        where: {
          id
        },
        data: {
          ...(normalizedNumber !== undefined
            ? { number: normalizedNumber }
            : {}),
          ...(data.label !== undefined
            ? { label: normalizeNullableString(data.label) }
            : {}),
          ...(resolvedManagerId !== undefined
            ? { managerId: resolvedManagerId }
            : {}),
          ...(data.providerAccountId !== undefined
            ? {
                providerAccountId: normalizeNullableString(
                  data.providerAccountId
                )
              }
            : {}),
            ...(whatsappConnectionId !== undefined
             ? { whatsappConnectionId }
            : {}),
          ...(normalizedExternalId !== undefined
            ? { externalId: normalizedExternalId }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.isDefault !== undefined
            ? { isDefault: data.isDefault }
            : {})
        },
        include: {
            whatsappConnection: {
            select: {
                id: true,
                wabaId: true,
                accessToken: true,
                status: true
            }
            },
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          },
          _count: {
            select: {
              campaigns: true,
              conversations: true
            }
          }
        }
      })
    })

    return serializePhoneNumber(phoneNumber)
  })
}