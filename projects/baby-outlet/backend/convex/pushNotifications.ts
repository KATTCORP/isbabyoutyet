"use node";

import type { PaginationResult } from "convex/server";
import { v } from "convex/values";
import webPush from "web-push";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { env, internalAction } from "./_generated/server";
import { babyFeedUrl, babyPageUrl } from "../src/babyFeedUrl";
import { getOwnerPushMessage, getPushMessage } from "../src/pushMessages";
import { supportedLocaleValidator } from "./i18n";
import { notifiableStatusValidator, ownerMessagePushEventValidator } from "./pushValidators";
import { requiredEnv } from "./requiredEnv";

type ShowPushPayload = {
  body: string;
  dismiss: false;
  icon: string | undefined;
  image: string | undefined;
  tag: string | undefined;
  title: string;
  url: string;
};

type DismissPushPayload = {
  dismiss: true;
  tag: string;
};

type PushPayload = ShowPushPayload | DismissPushPayload;

function ownerMessagePushTag(encouragementId: string) {
  return `encouragement-${encouragementId}`;
}

type PushSubscriptionKeys = {
  auth: string;
  endpoint: string;
  p256dh: string;
};

async function sendNotificationToSubscription(
  ctx: ActionCtx,
  opts: {
    payload: PushPayload;
    subscription: PushSubscriptionKeys;
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
        auth: opts.subscription.auth,
        p256dh: opts.subscription.p256dh,
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

async function sendPayloadToSubscriptionPages(
  ctx: ActionCtx,
  opts: {
    loadPage: (cursor: string | null) => Promise<PaginationResult<PushSubscriptionKeys>>;
    payload: PushPayload;
  },
) {
  let cursor: string | null = null;
  let successCount = 0;
  let failureCount = 0;
  for (;;) {
    const subscriptions = await opts.loadPage(cursor);
    const results = await Promise.allSettled(
      subscriptions.page.map((subscription) =>
        sendNotificationToSubscription(ctx, {
          payload: opts.payload,
          subscription,
        }),
      ),
    );
    const pageSuccessCount = results.filter(
      (result) => result.status === "fulfilled" && result.value === true,
    ).length;
    successCount += pageSuccessCount;
    failureCount += results.length - pageSuccessCount;
    if (subscriptions.isDone) {
      break;
    }
    cursor = subscriptions.continueCursor;
  }

  console.log(`Sent notifications: ${successCount} succeeded, ${failureCount} failed`);
}

export const sendNotification = internalAction({
  args: {
    babyId: v.id("baby"),
    babyName: v.string(),
    customMessage: v.union(v.string(), v.null()),
    locale: supportedLocaleValidator,
    notificationId: v.id("scheduledNotifications"),
    photoId: v.union(v.id("_storage"), v.null()),
    publicId: v.string(), // Still need publicId for the URL
    status: notifiableStatusValidator,
    updateId: v.union(v.id("updates"), v.null()),
  },
  handler: async (ctx, args) => {
    const message = getPushMessage({
      babyName: args.babyName,
      locale: args.locale,
      status: args.status,
    });
    const body = args.customMessage || message.body;

    const url = babyPageUrl(args.publicId);
    const imageStorageId = await ctx.runQuery(internal.baby.resolveNotificationImage, {
      photoId: args.photoId ?? null,
      updateId: args.updateId ?? null,
    });
    const image = imageStorageId
      ? ((await ctx.storage.getUrl(imageStorageId)) ?? undefined)
      : undefined;

    await sendPayloadToSubscriptionPages(ctx, {
      loadPage: async (cursor) => {
        const subscriptions: PaginationResult<Doc<"pushSubscriptions">> = await ctx.runQuery(
          internal.pushSubscriptions.getSubscriptionsPage,
          {
            babyId: args.babyId,
            paginationOpts: { cursor, numItems: 100 },
          },
        );
        return {
          ...subscriptions,
          page: subscriptions.page.map((subscription) => ({
            auth: subscription.auth,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
          })),
        };
      },
      payload: {
        body,
        icon: "/logo192.png",
        image,
        title: message.title,
        url,
        // Unique tag per baby+type so a later generic update doesn't replace a birth notice
        dismiss: false,
        tag: `baby-update-${args.publicId}-${args.status}`,
      },
    });

    // Mark the notification as sent
    await ctx.runMutation(internal.baby.markNotificationSent, {
      notificationId: args.notificationId,
    });
  },
});

async function loadOwnerSubscriptionKeysPage(
  ctx: ActionCtx,
  opts: { babyId: Doc<"ownerPushSubscriptions">["babyId"]; cursor: string | null },
) {
  const subscriptions: PaginationResult<Doc<"ownerPushSubscriptions">> = await ctx.runQuery(
    internal.pushSubscriptions.getOwnerSubscriptionsPage,
    {
      babyId: opts.babyId,
      paginationOpts: { cursor: opts.cursor, numItems: 100 },
    },
  );
  return {
    ...subscriptions,
    page: subscriptions.page.map((subscription) => ({
      auth: subscription.auth,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
    })),
  };
}

export const sendOwnerMessageNotification = internalAction({
  args: {
    authorName: v.string(),
    babyId: v.id("baby"),
    babyName: v.string(),
    encouragementId: v.id("encouragements"),
    event: ownerMessagePushEventValidator,
    locale: supportedLocaleValidator,
    message: v.string(),
    publicId: v.string(),
  },
  handler: async (ctx, args) => {
    const copy = getOwnerPushMessage({
      authorName: args.authorName,
      babyName: args.babyName,
      event: args.event,
      locale: args.locale,
      message: args.message,
    });

    await sendPayloadToSubscriptionPages(ctx, {
      loadPage: (cursor) => loadOwnerSubscriptionKeysPage(ctx, { babyId: args.babyId, cursor }),
      payload: {
        body: copy.body,
        dismiss: false,
        icon: "/logo192.png",
        image: undefined,
        tag: ownerMessagePushTag(args.encouragementId),
        title: copy.title,
        url: babyFeedUrl(args.publicId),
      },
    });
  },
});

export const dismissOwnerMessageNotification = internalAction({
  args: {
    babyId: v.id("baby"),
    encouragementId: v.id("encouragements"),
  },
  handler: async (ctx, args) => {
    await sendPayloadToSubscriptionPages(ctx, {
      loadPage: (cursor) => loadOwnerSubscriptionKeysPage(ctx, { babyId: args.babyId, cursor }),
      payload: {
        dismiss: true,
        tag: ownerMessagePushTag(args.encouragementId),
      },
    });
  },
});
