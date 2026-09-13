/**
 * Browser Web Push subscribe/read helpers. Owns permission, the service
 * worker PushManager, and VAPID key encoding so feature UI does not.
 */

import type { TranslationFunction } from "@/lib/i18n";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

function keysFromPushSubscription(subscription: PushSubscription) {
  const subscriptionData = subscription.toJSON();
  if (subscriptionData.endpoint && subscriptionData.keys?.p256dh && subscriptionData.keys?.auth) {
    return {
      auth: subscriptionData.keys.auth,
      endpoint: subscriptionData.endpoint,
      p256dh: subscriptionData.keys.p256dh,
    };
  }
  return null;
}

export async function readWebPushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return null;
  }
  return keysFromPushSubscription(subscription);
}

export async function ensureWebPushSubscription(
  vapidPublicKey: string,
  opts: { t: TranslationFunction },
) {
  if (Notification.permission === "default") {
    const permissionResult = await Notification.requestPermission();
    if (permissionResult !== "granted") {
      throw new Error(opts.t("Notification permission denied"));
    }
  } else if (Notification.permission !== "granted") {
    throw new Error(opts.t("Notification permission is required"));
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const keys = keysFromPushSubscription(existing);
    if (keys) {
      return keys;
    }
  }

  const pushSubscription = await registration.pushManager.subscribe({
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    userVisibleOnly: true,
  });
  const keys = keysFromPushSubscription(pushSubscription);
  if (!keys) {
    throw new Error(opts.t("Failed to get subscription data"));
  }
  return keys;
}
