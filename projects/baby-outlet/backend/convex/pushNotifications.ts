"use node";

import type { PaginationResult } from "convex/server";
import { v } from "convex/values";
import webPush from "web-push";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { env, internalAction } from "./_generated/server";
import { getPushMessage } from "../src/pushMessages";
import { supportedLocaleValidator } from "./i18n";
import { notifiableStatusValidator } from "./pushValidators";
import { requiredEnv } from "./requiredEnv";

async function sendNotificationToSubscription(
  ctx: ActionCtx,
  opts: {
    subscription: {
      endpoint: string;
      p256dh: string;
      auth: string;
    };
    payload: {
      title: string;
      body: string;
      url: string;
      icon: string | undefined;
      image: string | undefined;
      tag: string | undefined;
    };
  },
): Promise<boolean> {
  webPush.setVapidDetails(
    env.VAPID_SUBJECT ?? "mailto:admin@isbabyoutyet.com",
    requiredEnv("VAPID_PUBLIC_KEY", env.VAPID_PUBLIC_KEY),
    requiredEnv("VAPID_PRIVATE_KEY", env.VAPID_PRIVATE_KEY),
  );
  try {
    const pushSubscription = {
      endpoint: opts.subscription.endpoint,
      keys: {
        p256dh: opts.subscription.p256dh,
        auth: opts.subscription.auth,
      },
    };

    await webPush.sendNotification(pushSubscription, JSON.stringify(opts.payload));
    return true;
  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      // 410 means the subscription is expired/invalid
      if ("statusCode" in error && (error.statusCode === 410 || error.statusCode === 404)) {
        // Delete invalid subscription
        await ctx.runMutation(internal.pushSubscriptions.removeByEndpoint, {
          endpoint: opts.subscription.endpoint,
        });
      }
    }
    console.error("Failed to send notification:", error);
    return false;
  }
}

export const sendNotification = internalAction({
  args: {
    notificationId: v.id("scheduledNotifications"),
    babyId: v.id("baby"),
    babyName: v.string(),
    publicId: v.string(), // Still need publicId for the URL
    status: notifiableStatusValidator,
    customMessage: v.optional(v.union(v.string(), v.null())),
    photoId: v.optional(v.union(v.id("_storage"), v.null())),
    updateId: v.optional(v.union(v.id("updates"), v.null())),
    locale: supportedLocaleValidator,
  },
  handler: async (ctx, args) => {
    const message = getPushMessage({
      locale: args.locale,
      status: args.status,
      babyName: args.babyName,
    });
    const body = args.customMessage || message.body;

    const url = `/baby/${args.publicId}`;
    const imageStorageId = await ctx.runQuery(internal.baby.resolveNotificationImage, {
      updateId: args.updateId ?? null,
      photoId: args.photoId ?? null,
    });
    const image = imageStorageId
      ? ((await ctx.storage.getUrl(imageStorageId)) ?? undefined)
      : undefined;

    let cursor: string | null = null;
    let successCount = 0;
    let failureCount = 0;
    for (;;) {
      const subscriptions: PaginationResult<Doc<"pushSubscriptions">> = await ctx.runQuery(
        internal.pushSubscriptions.getSubscriptionsPage,
        {
          babyId: args.babyId,
          paginationOpts: { numItems: 100, cursor },
        },
      );
      const results = await Promise.allSettled(
        subscriptions.page.map((subscription) =>
          sendNotificationToSubscription(ctx, {
            subscription: {
              endpoint: subscription.endpoint,
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
            payload: {
              title: message.title,
              body,
              url,
              icon: "/logo192.png",
              image,
              // Unique tag per baby+type so a later generic update doesn't replace a birth notice
              tag: `baby-update-${args.publicId}-${args.status}`,
            },
          }),
        ),
      );
      const pageSuccessCount = results.filter(
        (result) => result.status === "fulfilled" && result.value === true,
      ).length;
      successCount += pageSuccessCount;
      failureCount += results.length - pageSuccessCount;
      if (subscriptions.isDone) break;
      cursor = subscriptions.continueCursor;
    }

    console.log(`Sent notifications: ${successCount} succeeded, ${failureCount} failed`);

    // Mark the notification as sent
    await ctx.runMutation(internal.baby.markNotificationSent, {
      notificationId: args.notificationId,
    });
  },
});
