import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: {
      id: 'seed-tenant-operacao-brasilia'
    },
    update: {
      name: 'Operação Brasília'
    },
    create: {
      id: 'seed-tenant-operacao-brasilia',
      name: 'Operação Brasília'
    }
  })

  const phone = await prisma.phoneNumber.upsert({
    where: {
      number: '5561999999999'
    },
    update: {
      label: 'Brasília Principal',
      tenantId: tenant.id,
      provider: 'WHATSAPP_CLOUD',
      externalId: 'meta-phone-number-id-seed',
      providerAccountId: 'meta-waba-id-seed',
      isActive: true
    },
    create: {
      number: '5561999999999',
      label: 'Brasília Principal',
      tenantId: tenant.id,
      provider: 'WHATSAPP_CLOUD',
      externalId: 'meta-phone-number-id-seed',
      providerAccountId: 'meta-waba-id-seed',
      isActive: true
    }
  })
  const master = await prisma.user.upsert({
  where: {
    email: 'master@flyhub.com'
  },
  update: {
    name: 'Master FlyHub',
    tenantId: tenant.id,
    role: 'MASTER',
    isActive: true
  },
  create: {
    name: 'Master FlyHub',
    email: 'master@flyhub.com',
    tenantId: tenant.id,
    role: 'MASTER',
    isActive: true
  }
})
  const admin = await prisma.user.upsert({
    where: {
      email: 'admin@flyhub.com'
    },
    update: {
      name: 'Admin FlyHub',
      tenantId: tenant.id,
      role: 'ADMIN',
      isActive: true
    },
    create: {
      name: 'Admin FlyHub',
      email: 'admin@flyhub.com',
      tenantId: tenant.id,
      role: 'ADMIN',
      isActive: true
    }
  })

  const manager = await prisma.user.upsert({
    where: {
      email: 'gerente@flyhub.com'
    },
    update: {
      name: 'Gerente Brasília',
      tenantId: tenant.id,
      role: 'MANAGER',
      isActive: true
    },
    create: {
      name: 'Gerente Brasília',
      email: 'gerente@flyhub.com',
      tenantId: tenant.id,
      role: 'MANAGER',
      isActive: true
    }
  })

  const agent1 = await prisma.user.upsert({
    where: {
      email: 'atendente@flyhub.com'
    },
    update: {
      name: 'Atendente 1',
      tenantId: tenant.id,
      role: 'AGENT',
      isActive: true
    },
    create: {
      name: 'Atendente 1',
      email: 'atendente@flyhub.com',
      tenantId: tenant.id,
      role: 'AGENT',
      isActive: true
    }
  })

  const agent2 = await prisma.user.upsert({
    where: {
      email: 'atendente2@flyhub.com'
    },
    update: {
      name: 'Atendente 2',
      tenantId: tenant.id,
      role: 'AGENT',
      isActive: true
    },
    create: {
      name: 'Atendente 2',
      email: 'atendente2@flyhub.com',
      tenantId: tenant.id,
      role: 'AGENT',
      isActive: true
    }
  })

  const contact1 = await prisma.contact.upsert({
    where: {
      tenantId_phone: {
        tenantId: tenant.id,
        phone: '5561988888888'
      }
    },
    update: {
      name: 'Cliente Teste',
      phoneRaw: '(61) 98888-8888',
      email: 'cliente.teste@example.com',
      flyImobLeadId: 'flyimob-seed-lead-001'
    },
    create: {
      name: 'Cliente Teste',
      phone: '5561988888888',
      phoneRaw: '(61) 98888-8888',
      email: 'cliente.teste@example.com',
      tenantId: tenant.id,
      flyImobLeadId: 'flyimob-seed-lead-001'
    }
  })

  const contact2 = await prisma.contact.upsert({
    where: {
      tenantId_phone: {
        tenantId: tenant.id,
        phone: '5561977777777'
      }
    },
    update: {
      name: 'Cliente Webchat',
      phoneRaw: '(61) 97777-7777',
      email: 'cliente.webchat@example.com',
      flyImobLeadId: 'flyimob-seed-lead-002'
    },
    create: {
      name: 'Cliente Webchat',
      phone: '5561977777777',
      phoneRaw: '(61) 97777-7777',
      email: 'cliente.webchat@example.com',
      tenantId: tenant.id,
      flyImobLeadId: 'flyimob-seed-lead-002'
    }
  })

  const now = new Date()

  const inboundAt1 = new Date(now.getTime() - 1000 * 60 * 5)
  const outboundAt1 = new Date(now.getTime() - 1000 * 60 * 3)

  const inboundAt2 = new Date(now.getTime() - 1000 * 60 * 15)

  const seedMetaThreadId1 = 'seed-thread-cliente-teste-whatsapp'
  const seedMetaThreadId2 = 'seed-thread-cliente-webchat'

  await prisma.$transaction(async (tx) => {
    const existingConversations = await tx.conversation.findMany({
      where: {
        tenantId: tenant.id,
        metaThreadId: {
          in: [seedMetaThreadId1, seedMetaThreadId2]
        }
      },
      select: {
        id: true
      }
    })

    if (existingConversations.length > 0) {
      await tx.conversation.deleteMany({
        where: {
          id: {
            in: existingConversations.map((conversation) => conversation.id)
          }
        }
      })
    }

    const conversation1 = await tx.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact1.id,
        phoneNumberId: phone.id,
        assignedUserId: agent1.id,
        status: 'OPEN',
        channel: 'WHATSAPP',
        mode: 'MANUAL',
        priority: 'NORMAL',
        subject: 'Atendimento inicial - Cliente Teste',
        metaThreadId: seedMetaThreadId1,
        lastMessageAt: outboundAt1,
        lastInboundAt: inboundAt1,
        lastOutboundAt: outboundAt1,
        waitingSince: inboundAt1,
        assignedAt: inboundAt1,
        firstResponseAt: outboundAt1
      }
    })

    await tx.assignment.create({
      data: {
        conversationId: conversation1.id,
        userId: agent1.id,
        assignedByUserId: manager.id,
        assignedAt: inboundAt1,
        reason: 'Seed inicial - WhatsApp'
      }
    })

    await tx.message.create({
      data: {
        conversationId: conversation1.id,
        content: 'Oi, tenho interesse no imóvel',
        senderType: 'LEAD',
        direction: 'INBOUND',
        type: 'TEXT',
        status: 'DELIVERED',
        provider: 'WHATSAPP_CLOUD',
        externalMessageId: 'wamid.seed.inbound.1',
        externalStatus: 'delivered',
        createdAt: inboundAt1,
        deliveredAt: inboundAt1
      }
    })

    await tx.message.create({
      data: {
        conversationId: conversation1.id,
        content: 'Perfeito, vou te ajudar!',
        senderType: 'AGENT',
        senderUserId: agent1.id,
        direction: 'OUTBOUND',
        type: 'TEXT',
        status: 'SENT',
        provider: 'WHATSAPP_CLOUD',
        externalMessageId: 'wamid.seed.outbound.1',
        externalStatus: 'sent',
        createdAt: outboundAt1,
        sentAt: outboundAt1
      }
    })

    const conversation2 = await tx.conversation.create({
      data: {
        tenantId: tenant.id,
        contactId: contact2.id,
        phoneNumberId: phone.id,
        assignedUserId: agent2.id,
        status: 'PENDING',
        channel: 'WEBCHAT',
        mode: 'AI',
        priority: 'HIGH',
        subject: 'Lead do webchat aguardando retorno',
        metaThreadId: seedMetaThreadId2,
        lastMessageAt: inboundAt2,
        lastInboundAt: inboundAt2,
        waitingSince: inboundAt2,
        assignedAt: inboundAt2,
        firstResponseAt: null
      }
    })

    await tx.assignment.create({
      data: {
        conversationId: conversation2.id,
        userId: agent2.id,
        assignedByUserId: manager.id,
        assignedAt: inboundAt2,
        reason: 'Seed inicial - Webchat'
      }
    })

    await tx.message.create({
      data: {
        conversationId: conversation2.id,
        content: 'Olá, quero saber mais sobre financiamento.',
        senderType: 'LEAD',
        direction: 'INBOUND',
        type: 'TEXT',
        status: 'DELIVERED',
        provider: 'INTERNAL',
        externalMessageId: 'internal.seed.inbound.1',
        externalStatus: 'delivered',
        createdAt: inboundAt2,
        deliveredAt: inboundAt2
      }
    })

    console.log('Seed concluído com sucesso.')
    console.log({
      tenantId: tenant.id,
      phoneNumberId: phone.id,
      masterUserId: master.id,
      adminUserId: admin.id,
      managerUserId: manager.id,
      agent1UserId: agent1.id,
      agent2UserId: agent2.id,
      contact1Id: contact1.id,
      contact2Id: contact2.id,
      conversation1Id: conversation1.id,
      conversation2Id: conversation2.id
    })
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })