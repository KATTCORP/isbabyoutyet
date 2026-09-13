/**
 * Reuse the open baby page tab (hash ignored). Keep in sync with
 * `shouldReuseBabyClient` in `projects/isbabyoutyet/web/src/lib/notification-click.ts`.
 * Nested overlay paths (`/settings`, `/login`, …) do not match.
 */
function shouldReuseBabyClient(clientUrl, targetUrl) {
  const client = new URL(clientUrl);
  const target = new URL(targetUrl);
  if (client.origin !== target.origin) {
    return false;
  }
  const babyPage = /^\/baby\/([^/]+)\/?$/;
  const clientBaby = babyPage.exec(client.pathname);
  const targetBaby = babyPage.exec(target.pathname);
  return Boolean(clientBaby && targetBaby && clientBaby[1] === targetBaby[1]);
}

// Service Worker for Push Notifications
const CACHE_NAME = "isbabyoutyet-v1";

function isString(value) {
  return typeof value === "string";
}

// Install event - cache static assets
self.addEventListener("install", (_event) => {
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      );
    }),
  );
  return self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener("push", (event) => {
  if (!event.data) {
    console.error("Push event received without data");
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (error) {
    console.error("Failed to parse push data:", error);
    return;
  }

  event.waitUntil(
    (async () => {
      if (data.dismiss === true) {
        if (!isString(data.tag)) {
          return;
        }
        const notifications = await self.registration.getNotifications({ tag: data.tag });
        for (const notification of notifications) {
          notification.close();
        }
        return;
      }

      await self.registration.showNotification(data.title, {
        badge: data.icon, // Use same icon for badge
        body: data.body,
        data: { url: data.url },
        icon: data.icon,
        image: isString(data.image) ? data.image : undefined,
        requireInteraction: false,
        tag: data.tag,
      });
    })(),
  );
});

// Notification click event - open the baby page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlPath = event.notification.data?.url || "/";
  // Convert relative URL to absolute for proper comparison with client.url
  const urlToOpen = new URL(urlPath, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({
        includeUncontrolled: true,
        type: "window",
      })
      .then((clientList) => {
        for (const client of clientList) {
          if (shouldReuseBabyClient(client.url, urlToOpen) && "focus" in client) {
            // WindowClient.postMessage has no targetOrigin; this client is already same-origin.
            // oxlint-disable-next-line unicorn/require-post-message-target-origin
            client.postMessage({ type: "notification-click", url: urlToOpen });
            // Do not client.navigate() — it rejects on uncontrolled / iOS
            // clients and then focus never runs. The page sets #feed itself.
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      }),
  );
});
