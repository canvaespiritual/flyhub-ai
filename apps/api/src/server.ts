import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { publish } from "./lib/realtime.js";

function mapConversationMode(mode: "MANUAL" | "AI") {
  return mode === "AI" ? "ai" : "manual";
}

function mapConversationStatus(status: "OPEN" | "PENDING" | "CLOSED") {
  switch (status) {
    case "OPEN":
      return "open";
    case "PENDING":
      return "pending";
    case "CLOSED":
      return "closed";
    default:
      return "open";
  }
}

function mapConversationPriority(priority: "LOW" | "NORMAL" | "HIGH") {
  switch (priority) {
    case "LOW":
      return "low";
    case "HIGH":
      return "high";
    case "NORMAL":
    default:
      return "normal";
  }
}

async function start() {
  const app = await buildApp();
  const port = Number(process.env.PORT || 3333);

  try {
    await app.listen({
      port,
      host: "0.0.0.0",
    });

    app.log.info(`HTTP server running on port ${port}`);

    // 🔥 SLA TIMEOUT ENGINE (5 min)
    const SLA_TIMEOUT_MS = 5 * 60 * 1000;

    setInterval(async () => {
      try {
        const now = new Date();
        const threshold = new Date(Date.now() - SLA_TIMEOUT_MS);

        const expiredConversations = await prisma.conversation.findMany({
          where: {
            status: "OPEN",
            mode: "MANUAL",
            assignedUserId: {
              not: null
            },
            assignedAt: {
              lte: threshold
            },
            firstResponseAt: null
          },
          include: {
            assignedUser: true,
            phoneNumber: true
          }
        });

        for (const conversation of expiredConversations) {
          await prisma.$transaction(async (tx) => {
            const activeAssignments = await tx.assignment.findMany({
              where: {
                conversationId: conversation.id,
                unassignedAt: null
              },
              select: {
                id: true
              }
            });

            if (activeAssignments.length > 0) {
              await tx.assignment.updateMany({
                where: {
                  id: {
                    in: activeAssignments.map((a) => a.id)
                  }
                },
                data: {
                  unassignedAt: now,
                  reason: "SLA timeout"
                }
              });
            }

            const updated = await tx.conversation.update({
              where: {
                id: conversation.id
              },
              data: {
                assignedUserId: null,
                assignedAt: null,
                waitingSince: now
              },
              include: {
                assignedUser: true,
                phoneNumber: true
              }
            });

            publish(conversation.tenantId, {
              type: "conversation:assigned",
              payload: {
                id: updated.id,
                mode: mapConversationMode(updated.mode),
                status: mapConversationStatus(updated.status),
                updatedAt: updated.updatedAt.toISOString(),
                assignedAt: updated.assignedAt?.toISOString(),
                waitingSince: updated.waitingSince?.toISOString(),
                firstResponseAt: updated.firstResponseAt?.toISOString(),
                closedAt: updated.closedAt?.toISOString(),
                priority: mapConversationPriority(updated.priority),
                subject: updated.subject ?? undefined,
                metaThreadId: updated.metaThreadId ?? undefined,
                assignedUser: updated.assignedUser
                  ? {
                      id: updated.assignedUser.id,
                      name: updated.assignedUser.name,
                      email: updated.assignedUser.email,
                      role: updated.assignedUser.role.toLowerCase()
                    }
                  : null,
                phoneNumber: {
                  id: updated.phoneNumber.id,
                  number: updated.phoneNumber.number,
                  label: updated.phoneNumber.label ?? undefined
                }
              }
            });
          });
        }
      } catch (err) {
        console.error("SLA engine error:", err);
      }
    }, 30 * 1000);

  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();