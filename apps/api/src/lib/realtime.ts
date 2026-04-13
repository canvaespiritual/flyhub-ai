type Client = {
  id: string
  send: (data: unknown) => void
}

const clientsByTenant = new Map<string, Map<string, Client>>()

export function subscribe(tenantId: string, client: Client) {
  if (!clientsByTenant.has(tenantId)) {
    clientsByTenant.set(tenantId, new Map())
  }

  clientsByTenant.get(tenantId)!.set(client.id, client)
}

export function unsubscribe(tenantId: string, client: Client) {
  const tenantClients = clientsByTenant.get(tenantId)
  if (!tenantClients) return

  tenantClients.delete(client.id)

  if (tenantClients.size === 0) {
    clientsByTenant.delete(tenantId)
  }
}

export function publish(tenantId: string, event: unknown) {
  const tenantClients = clientsByTenant.get(tenantId)
  if (!tenantClients) return

  for (const client of tenantClients.values()) {
    try {
      client.send(event)
    } catch {
      tenantClients.delete(client.id)
    }
  }

  if (tenantClients.size === 0) {
    clientsByTenant.delete(tenantId)
  }
}