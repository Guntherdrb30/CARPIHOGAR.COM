self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        data = { body: event.data.text() };
      }
    }
  } catch (e) {
    // ignore
  }

  const title = data.title || "Carpihogar Delivery";
  const body = data.body || "Tienes una nueva actualización de delivery.";
  const url = data.url || "/dashboard/delivery";

  const options = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification && event.notification.data && event.notification.data.url) ||
    "/dashboard/delivery";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
      return undefined;
    }),
  );
});

