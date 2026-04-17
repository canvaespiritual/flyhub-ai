type SocketLike = {
  send: (data: string) => void
  readyState?: number
}

type Client = {
  id: string
  userId: string
  tenantId: string
  socket: SocketLike
}

const clientsByTenant = new Map<string, Map<string, Client>>()

export function subscribe(client: Client) {
  if (!clientsByTenant.has(client.tenantId)) {
    clientsByTenant.set(client.tenantId, new Map())
  }

  clientsByTenant.get(client.tenantId)!.set(client.id, client)
}

export function unsubscribe(client: Client) {
  const tenantClients = clientsByTenant.get(client.tenantId)
  if (!tenantClients) return

  tenantClients.delete(client.id)

  if (tenantClients.size === 0) {
    clientsByTenant.delete(client.tenantId)
  }
}

export function publish(tenantId: string, event: unknown) {
  const tenantClients = clientsByTenant.get(tenantId)
  if (!tenantClients) return

  const payload = JSON.stringify(event)

  for (const client of tenantClients.values()) {
    try {
      if (client.socket.readyState !== undefined && client.socket.readyState !== 1) {
        tenantClients.delete(client.id)
        continue
      }

      client.socket.send(payload)
    } catch {
      tenantClients.delete(client.id)
    }
  }

  if (tenantClients.size === 0) {
    clientsByTenant.delete(tenantId)
  }
}