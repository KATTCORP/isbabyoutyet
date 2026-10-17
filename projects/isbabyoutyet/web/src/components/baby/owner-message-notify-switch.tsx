import { useI18n } from "@/lib/i18n";
import { useClientHydration } from "@/lib/use-client-hydration";
import { ensureWebPushSubscription, readWebPushSubscription } from "@/lib/web-push-subscription";
import { BellIcon } from "@phosphor-icons/react";
import { useQuery } from "@raf-query/react";
import { useMutation } from "convex/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { needsIosPushInstall } from "@/lib/browser-push-capability";
import { convexQuery } from "@workspace/convex-query";
import type { EnsuredConvexQuery } from "@workspace/convex-query";
import type { BrowserPushHandle } from "@/lib/use-browser-push-capability";
import { useBrowserPushCapability } from "@/lib/use-browser-push-capability";
import { usePendingAction } from "@/lib/use-pending-action";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item";
import { FormControl, FormField, FormItem, useFormField } from "@workspace/ui/components/form";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { toast } from "sonner";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { IosPwaInstallPrompt } from "./notification-subscribe";

type DisabledReason = "unsupported" | "needsIosInstall";

function ownerMessageNotifyCopy(opts: { checked: boolean; disabledReason: DisabledReason | null }) {
  if (opts.disabledReason === "needsIosInstall") {
    return {
      description:
        "On iPhone, message notifications need the Home Screen app. You'll turn them on after you open it from the icon.",
      title: "Message notifications",
    } as const;
  }
  if (opts.disabledReason === "unsupported") {
    return {
      description: "Push notifications are not supported in this browser.",
      title: "Message notifications",
    } as const;
  }
  return {
    description: opts.checked
      ? "You'll get a push when someone leaves a message on this page."
      : "Get notified when someone leaves a message",
    title: "Message notifications",
  } as const;
}

type SwitchViewProps = {
  checked: boolean;
  disabled: boolean;
  disabledReason: DisabledReason | null;
  onCheckedChange: ((checked: boolean) => void) | null;
};

/**
 * Presentational message-notification switch for tests and both layouts.
 *
 * @internal
 */
export function OwnerMessageNotifySwitchView(
  props: SwitchViewProps & { layout: "form" | "settings" },
) {
  if (props.layout === "settings") {
    return <SettingsMessageNotifyRow {...props} />;
  }
  return <FormMessageNotifyRow {...props} />;
}

function MessageNotifySwitch(
  props: SwitchViewProps & { labelledBy: string; switchId: string | null },
) {
  const { t } = useI18n();
  if (props.disabledReason === "needsIosInstall") {
    return (
      <IosPwaInstallPrompt
        audience="owner"
        trigger={
          <Button id={props.switchId ?? undefined} size="sm" type="button" variant="outline">
            {t("Get Notifications")}
          </Button>
        }
      />
    );
  }
  return (
    <Switch
      aria-labelledby={props.labelledBy}
      checked={props.checked}
      disabled={props.disabled || props.onCheckedChange === null}
      id={props.switchId ?? undefined}
      onCheckedChange={(checked) => {
        props.onCheckedChange?.(checked);
      }}
    />
  );
}

function SettingsMessageNotifyRow(props: SwitchViewProps) {
  const { t } = useI18n();
  const copy = ownerMessageNotifyCopy(props);
  const titleId = "owner-message-notify-title";

  return (
    <Item>
      <ItemMedia variant="icon">
        <BellIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle id={titleId}>{t(copy.title)}</ItemTitle>
        <ItemDescription>{t(copy.description)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <MessageNotifySwitch {...props} labelledBy={titleId} switchId={null} />
      </ItemActions>
    </Item>
  );
}

function FormMessageNotifyRow(props: SwitchViewProps) {
  const { t } = useI18n();
  const { formDescriptionId, formItemId } = useFormField();
  const copy = ownerMessageNotifyCopy(props);
  const titleId = `${formItemId}-title`;

  return (
    <label className="flex items-center justify-between gap-4" htmlFor={formItemId}>
      <div className="flex flex-col gap-1">
        <span className="text-sm leading-none font-bold" id={titleId}>
          {t(copy.title)}
        </span>
        <span className="text-muted-foreground text-sm" id={formDescriptionId}>
          {t(copy.description)}
        </span>
      </div>
      <FormControl aria-labelledby={titleId}>
        <MessageNotifySwitch {...props} labelledBy={titleId} switchId={formItemId} />
      </FormControl>
    </label>
  );
}

export function OwnerMessageNotifyFormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: { control: Control<TFieldValues, unknown, unknown>; name: TName }) {
  const hydrated = useClientHydration();
  // Add-baby is `/dashboard/add`, outside the baby PWA scope. Home Screen
  // install from this form would bookmark the dashboard, not the baby page.
  if (hydrated && needsIosPushInstall()) {
    return null;
  }
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={(renderProps) => (
        <FormItem className="border-0 p-0">
          <OwnerMessageNotifySwitchView
            checked={Boolean(renderProps.field.value)}
            disabled={false}
            disabledReason={null}
            layout="form"
            onCheckedChange={renderProps.field.onChange}
          />
        </FormItem>
      )}
    />
  );
}

type OwnerMessageNotifyLiveSwitchProps = {
  babyId: Id<"baby">;
  browserPush: BrowserPushHandle;
  vapidPublicKey: EnsuredConvexQuery<typeof api.pushSubscriptions.getPublicKey>;
};

export function OwnerMessageNotifyLiveSwitch(props: OwnerMessageNotifyLiveSwitchProps) {
  const { t } = useI18n();
  const [capability, refetchCapability] = useBrowserPushCapability(props.browserPush);
  const [vapidPublicKey] = useQuery(
    convexQuery(api.pushSubscriptions.getPublicKey),
    props.vapidPublicKey,
  );
  const [isPending, runAction] = usePendingAction();
  const subscribeAsOwnerMutationFn = useMutation(api.pushSubscriptions.subscribeAsOwner);
  const unsubscribeAsOwnerMutationFn = useMutation(api.pushSubscriptions.unsubscribeAsOwner);

  const subscribe = () =>
    runAction(async () => {
      if (!vapidPublicKey) {
        throw new Error(t("Push notifications are not supported in this browser."));
      }
      const keys = await ensureWebPushSubscription(vapidPublicKey, { t });
      await subscribeAsOwnerMutationFn({
        auth: keys.auth,
        babyId: props.babyId,
        endpoint: keys.endpoint,
        p256dh: keys.p256dh,
        userAgent: navigator.userAgent,
      });
      await refetchCapability();
    });

  const unsubscribe = () =>
    runAction(async () => {
      const keys = await readWebPushSubscription();
      if (!keys) {
        return;
      }
      await unsubscribeAsOwnerMutationFn({
        auth: keys.auth,
        babyId: props.babyId,
        endpoint: keys.endpoint,
        p256dh: keys.p256dh,
      });
      await refetchCapability();
    });

  const checked = capability?.kind === "subscribed" && capability.messages;
  const disabledReason =
    capability?.kind === "needsIosInstall"
      ? "needsIosInstall"
      : capability?.kind === "unsupported"
        ? "unsupported"
        : null;
  const iosInstallPending = disabledReason === "needsIosInstall";

  return (
    <OwnerMessageNotifySwitchView
      checked={Boolean(checked)}
      disabled={
        isPending ||
        !capability ||
        !vapidPublicKey ||
        (disabledReason !== null && !iosInstallPending) ||
        capability.kind === "serviceWorkerTimeout"
      }
      disabledReason={disabledReason}
      layout="settings"
      onCheckedChange={(nextChecked) => {
        if (nextChecked) {
          toast.promise(subscribe(), {
            error: (error) =>
              error instanceof Error ? error.message : t("Failed to subscribe to notifications"),
            loading: t("Subscribing to notifications..."),
            success: t("Subscribed to notifications!"),
          });
          return;
        }
        toast.promise(unsubscribe(), {
          error: (error) =>
            error instanceof Error ? error.message : t("Failed to unsubscribe from notifications"),
          loading: t("Unsubscribing from notifications..."),
          success: t("Unsubscribed from notifications!"),
        });
      }}
    />
  );
}
