import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item";
import { useMutation as useTanstackMutation } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";
import { toast } from "sonner";
import { z } from "zod";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { NotifiableStatus } from "@baby-outlet/backend/src/types";
import { FORBIDDEN } from "@baby-outlet/backend/src/types";
import type { PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import type { TranslationFunction } from "@/lib/i18n";
import { Form, SubmitButton, useZodForm } from "@/components/Form";
import { useI18n } from "@/lib/i18n";
import { useTimedTransition } from "@/lib/use-delayed-action";
import { useCurrentSecond } from "@/lib/use-current-second";
import { NOTIFICATION_LABEL_KEYS } from "./translation-keys";

type ScheduledNotificationsResult = Exclude<
  FunctionReturnType<typeof api.baby.getScheduledNotifications>,
  typeof FORBIDDEN
>;

const EMPTY_NOTIFICATIONS: ScheduledNotificationsResult = [];
const emptyActionSchema = z.object({});

type ScheduledNotificationToastProps = {
  notifications: PreloadedConvexQuery<typeof api.baby.getScheduledNotifications>;
  subscriptionCount: PreloadedConvexQuery<typeof api.pushSubscriptions.getSubscriptionCount>;
};

export function ScheduledNotificationToast(props: ScheduledNotificationToastProps) {
  const notificationsQuery = usePreloadedConvexQuery(
    api.baby.getScheduledNotifications,
    props.notifications,
  );
  // FORBIDDEN only happens for non-managers, who never render this component —
  // treat it like "nothing scheduled" so the types stay honest.
  const notificationsData = notificationsQuery.data;
  const notifications = notificationsData === FORBIDDEN ? EMPTY_NOTIFICATIONS : notificationsData;
  const subscriptionCountQuery = usePreloadedConvexQuery(
    api.pushSubscriptions.getSubscriptionCount,
    props.subscriptionCount,
  );
  const subscriptionCount =
    subscriptionCountQuery.data === FORBIDDEN ? 0 : subscriptionCountQuery.data;
  const tickEnabled = notifications.length > 0;
  const currentSecond = useCurrentSecond(tickEnabled);
  if (!tickEnabled || currentSecond === null) {
    return null;
  }

  const currentTime = currentSecond * 1000;

  return (
    <aside aria-live="polite" className="pointer-events-auto flex w-full flex-col gap-2">
      {notifications.map((notification) => (
        <ScheduledNotificationItem
          currentTime={currentTime}
          key={notification._id}
          notification={notification}
          subscriptionCount={subscriptionCount}
        />
      ))}
    </aside>
  );
}

type ScheduledNotification = Exclude<
  FunctionReturnType<typeof api.baby.getScheduledNotifications>,
  typeof FORBIDDEN
>[number];

function ScheduledNotificationItem(props: {
  currentTime: number;
  notification: ScheduledNotification;
  subscriptionCount: number;
}) {
  const { t } = useI18n();
  const sentRecently = useTimedTransition({
    durationMs: 4000,
    from: "pending",
    to: "sent",
    value: props.notification.status,
  });

  if (props.notification.status === "pending") {
    return (
      <NotificationToastContent
        currentTime={props.currentTime}
        notificationId={props.notification._id}
        notificationType={props.notification.notificationType}
        scheduledFor={props.notification.scheduledFor}
        subscriptionCount={props.subscriptionCount}
      />
    );
  }
  if (!sentRecently) {
    return null;
  }

  return (
    <Item
      className="w-full min-w-0 flex-nowrap border-green-500/50 bg-background shadow-lg"
      variant="outline"
    >
      <ItemMedia className="size-10 rounded-full bg-green-500/10">
        <CheckIcon className="size-5 text-green-500" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t("Notification sent!")}</ItemTitle>
        <ItemDescription>
          {t(NOTIFICATION_LABEL_KEYS[props.notification.notificationType])} ·{" "}
          {notificationAudienceLabel(t, props.subscriptionCount)}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

type NotificationToastContentProps = {
  currentTime: number;
  notificationId: Id<"scheduledNotifications">;
  notificationType: NotifiableStatus;
  scheduledFor: number;
  subscriptionCount: number;
};

function NotificationToastContent(props: NotificationToastContentProps) {
  const { t } = useI18n();
  const seconds = Math.max(0, Math.ceil((props.scheduledFor - props.currentTime) / 1000));

  const cancelMutation = useTanstackMutation({
    mutationFn: useConvexMutation(api.baby.cancelScheduledNotification),
  });
  const form = useZodForm({
    defaultValues: {},
    schema: emptyActionSchema,
  });

  if (cancelMutation.isSuccess) {
    return null;
  }

  return (
    <Item className="w-full min-w-0 flex-nowrap bg-background shadow-lg" variant="outline">
      <ItemMedia className="size-10 rounded-full bg-primary/10 tabular-nums text-lg font-semibold text-primary">
        {seconds}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t("Sending notification...")}</ItemTitle>
        <ItemDescription>
          {t(NOTIFICATION_LABEL_KEYS[props.notificationType])} ·{" "}
          {notificationAudienceLabel(t, props.subscriptionCount)}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="shrink-0">
        <Form
          form={form}
          handleSubmit={async () => {
            await cancelMutation.mutateAsync({ notificationId: props.notificationId });
            toast.success(t("Notification cancelled"));
          }}
        >
          <SubmitButton
            className="relative after:absolute after:-inset-3 after:content-['']"
            form="context"
            IconComponent={XIcon}
            iconPosition="start"
            size="default"
            variant="outline"
          >
            {t("Cancel")}
          </SubmitButton>
        </Form>
      </ItemActions>
    </Item>
  );
}

function notificationAudienceLabel(t: TranslationFunction, count: number) {
  if (count === 0) {
    return t("No one is subscribed yet");
  }
  if (count === 1) {
    return t("{{count}} person", { count });
  }
  return t("{{count}} people", { count });
}
