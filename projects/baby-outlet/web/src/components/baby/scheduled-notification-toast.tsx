import { Button } from "@workspace/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item";
import { Spinner } from "@workspace/ui/components/spinner";
import { useMutation as useTanstackMutation } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { Check, X } from "@phosphor-icons/react";
import type { NotifiableStatus } from "@baby-outlet/backend/src/types";
import { FORBIDDEN } from "@baby-outlet/backend/src/types";
import type { InitiatedConvexQuery, PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { useI18n } from "@/lib/i18n";
import { NOTIFICATION_LABEL_KEYS } from "./translation-keys";

type ScheduledNotificationToastProps = {
  notifications:
    | PreloadedConvexQuery<typeof api.baby.getScheduledNotifications>
    | InitiatedConvexQuery<typeof api.baby.getScheduledNotifications>;
  subscriptionCount:
    | PreloadedConvexQuery<typeof api.pushSubscriptions.getSubscriptionCount>
    | InitiatedConvexQuery<typeof api.pushSubscriptions.getSubscriptionCount>;
};

export function ScheduledNotificationToast(props: ScheduledNotificationToastProps) {
  const { t } = useI18n();
  const notificationsQuery = usePreloadedConvexQuery(
    api.baby.getScheduledNotifications,
    props.notifications,
  );
  // FORBIDDEN only happens for non-managers, who never render this component —
  // treat it like "nothing scheduled" so the types stay honest.
  const notificationsData = notificationsQuery.data;
  const notifications = notificationsData === FORBIDDEN ? [] : notificationsData;
  const pendingNotifications = notifications.filter(
    (notification) => notification.status === "pending",
  );
  const subscriptionCountQuery = usePreloadedConvexQuery(
    api.pushSubscriptions.getSubscriptionCount,
    props.subscriptionCount,
  );
  const subscriptionCount =
    subscriptionCountQuery.data === FORBIDDEN ? 0 : subscriptionCountQuery.data;

  // Track active toasts and previous notification states
  const activeToasts = useRef(new Set<Id<"scheduledNotifications">>());
  const previousPendingIds = useRef(new Set<Id<"scheduledNotifications">>());

  useEffect(() => {
    // Don't show any toasts if there are no subscribers
    if (subscriptionCount === 0) {
      // Dismiss any existing toasts
      for (const id of activeToasts.current) {
        toast.dismiss(id);
      }
      activeToasts.current.clear();
      previousPendingIds.current.clear();
      return;
    }

    const currentPendingIds = new Set(pendingNotifications.map((n) => n._id));

    // Check for notifications that were pending but are now sent
    for (const id of previousPendingIds.current) {
      if (!currentPendingIds.has(id)) {
        const notification = notifications.find((n) => n._id === id);
        if (notification?.status === "sent") {
          // Dismiss the countdown toast and show success
          toast.dismiss(id);
          activeToasts.current.delete(id);
          toast.custom(
            () => (
              <Item variant="outline" className="min-w-[300px] border-green-500/50 shadow-lg">
                <ItemMedia className="size-10 rounded-full bg-green-500/10">
                  <Check className="size-5 text-green-500" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("Notification sent!")}</ItemTitle>
                  <ItemDescription>
                    {t(NOTIFICATION_LABEL_KEYS[notification.notificationType])} ·{" "}
                    {t(subscriptionCount === 1 ? "{{count}} person" : "{{count}} people", {
                      count: subscriptionCount,
                    })}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ),
            { duration: 4000 },
          );
        } else {
          // Just dismiss if cancelled or other status
          toast.dismiss(id);
          activeToasts.current.delete(id);
        }
      }
    }

    // Update previous pending IDs for next comparison
    previousPendingIds.current = currentPendingIds;

    // Create toasts for new pending notifications
    for (const notification of pendingNotifications) {
      if (!activeToasts.current.has(notification._id)) {
        activeToasts.current.add(notification._id);
        toast.custom(
          () => (
            <NotificationToastContent
              notificationId={notification._id}
              notificationType={notification.notificationType}
              scheduledFor={notification.scheduledFor}
              subscriptionCount={subscriptionCount}
            />
          ),
          {
            id: notification._id,
            duration: Infinity,
          },
        );
      }
    }
  }, [notifications, pendingNotifications, subscriptionCount, t]);

  // Cleanup on unmount
  useEffect(() => {
    const toasts = activeToasts.current;
    return () => {
      for (const id of toasts) {
        toast.dismiss(id);
      }
    };
  }, []);

  return null;
}

type NotificationToastContentProps = {
  notificationId: Id<"scheduledNotifications">;
  notificationType: NotifiableStatus;
  scheduledFor: number;
  subscriptionCount: number;
};

function NotificationToastContent(props: NotificationToastContentProps) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.ceil((props.scheduledFor - Date.now()) / 1000)),
  );

  const cancelMutation = useTanstackMutation({
    mutationFn: useConvexMutation(api.baby.cancelScheduledNotification),
    onSuccess: () => {
      toast.dismiss(props.notificationId);
      toast.success(t("Notification cancelled"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("Failed to cancel notification"));
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((props.scheduledFor - Date.now()) / 1000));
      setSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [props.scheduledFor]);

  return (
    <Item variant="outline" className="min-w-[300px] shadow-lg bg-background">
      <ItemMedia className="size-10 rounded-full bg-primary/10 tabular-nums text-lg font-semibold text-primary">
        {seconds}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t("Sending notification...")}</ItemTitle>
        <ItemDescription>
          {t(NOTIFICATION_LABEL_KEYS[props.notificationType])} ·{" "}
          {t(props.subscriptionCount === 1 ? "{{count}} person" : "{{count}} people", {
            count: props.subscriptionCount,
          })}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="outline"
          size="sm"
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate({ notificationId: props.notificationId })}
        >
          {cancelMutation.isPending ? <Spinner className="size-4" /> : <X className="size-4" />}
          {t("Cancel")}
        </Button>
      </ItemActions>
    </Item>
  );
}
