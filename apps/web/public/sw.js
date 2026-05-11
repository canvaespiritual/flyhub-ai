self.addEventListener('push', function (event) {
  let payload = {
    title: 'FlyHub AI',
    body: 'Nova atualização no atendimento.',
    url: '/dashboard'
  }

  if (event.data) {
    try {
      payload = {
        ...payload,
        ...event.data.json()
      }
    } catch (error) {
      payload.body = event.data.text()
    }
  }

  const options = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: payload.url || '/dashboard',
      conversationId: payload.conversationId || null
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'FlyHub AI', options)
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})