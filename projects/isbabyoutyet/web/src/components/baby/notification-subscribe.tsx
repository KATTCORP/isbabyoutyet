import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { ensureWebPushSubscription, readWebPushSubscription } from "@/lib/web-push-subscription";
import { BellIcon, BellSlashIcon, ExportIcon } from "@phosphor-icons/react";
import type { EnsuredQueryHandle } from "@raf-query/react";
import { useQuery } from "@raf-query/react";
import { useMutation } from "convex/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { queries } from "@/lib/convex-queries";
import type { BrowserPushHandle } from "@/lib/use-browser-push-capability";
import { useBrowserPushCapability } from "@/lib/use-browser-push-capability";
import { usePendingAction } from "@/lib/use-pending-action";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Form, FormGuardProvider, SubmitButton, useFormGuard, useZodForm } from "@/components/Form";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field";
import { FormControl, FormField, FormItem } from "@workspace/ui/components/form";
import { Spinner } from "@workspace/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";

type NotificationSubscribeProps = {
  audience: "visitor" | "manager";
  babyId: Id<"baby">;
  browserPush: BrowserPushHandle;
  vapidPublicKey: EnsuredQueryHandle<typeof queries.pushSubscriptions.getPublicKey>;
};

type NotificationSelection = {
  family: boolean;
  messages: boolean;
};

export function NotificationSubscribe(props: NotificationSubscribeProps) {
  const { t } = useI18n();
  const [capability, refetchCapability] = useBrowserPushCapability(props.browserPush);
  const [vapidPublicKey] = useQuery(queries.pushSubscriptions.getPublicKey, props.vapidPublicKey);
  const [isLoading, runAction] = usePendingAction();

  const subscribeMutationFn = useMutation(api.pushSubscriptions.subscribe);
  const unsubscribeMutationFn = useMutation(api.pushSubscriptions.unsubscribe);
  const subscribeAsOwnerMutationFn = useMutation(api.pushSubscriptions.subscribeAsOwner);
  const unsubscribeAsOwnerMutationFn = useMutation(api.pushSubscriptions.unsubscribeAsOwner);

  const syncDeviceNotifications = async (selection: NotificationSelection) => {
    if (
      !capability ||
      capability.kind === "unsupported" ||
      capability.kind === "needsIosInstall" ||
      !vapidPublicKey
    ) {
      throw new Error(t("Push notifications are not supported in this browser."));
    }

    const familyOn = capability.kind === "subscribed" && capability.family;
    const messagesOn = capability.kind === "subscribed" && capability.messages;
    if (!selection.family && !selection.messages) {
      const existing = await readWebPushSubscription();
      if (!existing) {
        return;
      }
      const pushKeys = {
        auth: existing.auth,
        babyId: props.babyId,
        endpoint: existing.endpoint,
        p256dh: existing.p256dh,
      };
      if (familyOn) {
        await unsubscribeMutationFn(pushKeys);
      }
      if (messagesOn) {
        await unsubscribeAsOwnerMutationFn(pushKeys);
      }
      return;
    }

    const keys = await ensureWebPushSubscription(vapidPublicKey, { t });
    const pushKeys = {
      auth: keys.auth,
      babyId: props.babyId,
      endpoint: keys.endpoint,
      p256dh: keys.p256dh,
      userAgent: navigator.userAgent,
    };
    if (selection.family) {
      await subscribeMutationFn(pushKeys);
    } else if (familyOn) {
      await unsubscribeMutationFn(pushKeys);
    }
    if (selection.messages) {
      await subscribeAsOwnerMutationFn(pushKeys);
    } else if (messagesOn) {
      await unsubscribeAsOwnerMutationFn(pushKeys);
    }
  };

  const syncAndRefetch = (selection: NotificationSelection) =>
    runAction(async () => {
      await syncDeviceNotifications(selection);
      await refetchCapability();
    });

  const subscribeFamily = () =>
    runAction(async () => {
      if (!vapidPublicKey) {
        throw new Error(t("Push notifications are not supported in this browser."));
      }
      const keys = await ensureWebPushSubscription(vapidPublicKey, { t });
      await subscribeMutationFn({
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
        throw new Error(t("Failed to get subscription data"));
      }
      await unsubscribeMutationFn({
        auth: keys.auth,
        babyId: props.babyId,
        endpoint: keys.endpoint,
        p256dh: keys.p256dh,
      });
      await refetchCapability();
    });

  const familyOn = capability?.kind === "subscribed" && capability.family;
  const messagesOn = capability?.kind === "subscribed" && capability.messages;
  const isSubscribed = props.audience === "manager" ? familyOn || messagesOn : familyOn;

  if (!capability || !vapidPublicKey) {
    return <GetNotificationsPending />;
  }

  switch (capability.kind) {
    case "needsIosInstall":
      return (
        <IosPwaInstallPrompt
          audience={props.audience === "manager" ? "owner" : "visitor"}
          trigger={
            <Button size="lg" variant="default">
              <BellIcon className="w-5 h-5" />
              {t("Get Notifications")}
            </Button>
          }
        />
      );
    case "unsupported":
    case "serviceWorkerTimeout":
    case "unsubscribed":
    case "subscribed":
      if (props.audience === "manager") {
        return (
          <ManagerNotificationChooserView
            familyDefault={!familyOn && !messagesOn ? true : Boolean(familyOn)}
            isPending={isLoading}
            isSubscribed={Boolean(isSubscribed)}
            messagesDefault={!familyOn && !messagesOn ? true : Boolean(messagesOn)}
            onSubmit={async (selection) => {
              await toastPushSync({
                run: syncAndRefetch(selection),
                t,
                turningOff: !selection.family && !selection.messages,
              });
            }}
          />
        );
      }
      return (
        <NotificationSubscribeControls
          isLoading={isLoading}
          isSubscribed={Boolean(isSubscribed)}
          onClick={() => {
            if (isSubscribed) {
              toast.promise(unsubscribe(), {
                error: (error) =>
                  error instanceof Error
                    ? error.message
                    : t("Failed to unsubscribe from notifications"),
                loading: t("Unsubscribing from notifications..."),
                success: t("Unsubscribed from notifications!"),
              });
              return;
            }
            toastPushSync({
              run: subscribeFamily(),
              t,
              turningOff: false,
            });
          }}
        />
      );
    default: {
      const _exhaustive: never = capability;
      return _exhaustive;
    }
  }
}

function toastPushSync(opts: { run: Promise<void>; t: TranslationFunction; turningOff: boolean }) {
  toast.promise(
    opts.run,
    opts.turningOff
      ? {
          error: (error) =>
            error instanceof Error
              ? error.message
              : opts.t("Failed to unsubscribe from notifications"),
          loading: opts.t("Unsubscribing from notifications..."),
          success: opts.t("Unsubscribed from notifications!"),
        }
      : {
          error: (error) =>
            error instanceof Error ? error.message : opts.t("Failed to subscribe to notifications"),
          loading: opts.t("Subscribing to notifications..."),
          success: opts.t("Subscribed to notifications!"),
        },
  );
  return opts.run;
}

function GetNotificationsPending() {
  const { t } = useI18n();
  return (
    <Button disabled size="lg" variant="default">
      <BellIcon className="w-5 h-5" />
      {t("Get Notifications")}
    </Button>
  );
}

export function IosPwaInstallPrompt(props: {
  audience: "visitor" | "owner";
  trigger: ReactElement;
}) {
  const { t } = useI18n();

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger render={<DialogTrigger render={props.trigger} />} />
        <TooltipContent className="max-w-xs">
          <p>
            {t(
              "To receive notifications on iOS, add this page to your Home Screen first. Tap for instructions.",
            )}
          </p>
        </TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Get Notifications on iOS")}</DialogTitle>
          <DialogDescription>
            {t("Install this app on your Home Screen before enabling push notifications on iOS.")}
          </DialogDescription>
        </DialogHeader>
        <ol className="flex list-decimal list-inside flex-col gap-3 text-sm">
          <li className="flex items-start gap-2">
            <span className="font-medium min-w-5">1.</span>
            <span>
              {t("Tap the Share button in Safari")} <ExportIcon className="inline w-4 h-4 mx-1" />
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium min-w-5">2.</span>
            <span>{t('Scroll down and tap "Add to Home Screen"')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium min-w-5">3.</span>
            <span>{t("Open the app from your Home Screen")}</span>
          </li>
          {props.audience === "owner" ? (
            <>
              <li className="flex items-start gap-2">
                <span className="font-medium min-w-5">4.</span>
                <span>
                  {t(
                    "The Home Screen icon does not inherit your Safari login. Sign in inside the app, then tap Get Notifications.",
                  )}
                </span>
              </li>
            </>
          ) : (
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-5">4.</span>
              <span>{t('Come back here and tap "Get Notifications"')}</span>
            </li>
          )}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

const chooserSchema = z.object({
  family: z.boolean(),
  messages: z.boolean(),
});

/**
 * Manager chooser for status and/or message alerts. Guarded overlay form:
 * Save waits for the mutation, then closes; dirty dismiss asks to discard.
 *
 * @internal
 */
export function ManagerNotificationChooserView(props: {
  familyDefault: boolean;
  isPending: boolean;
  isSubscribed: boolean;
  messagesDefault: boolean;
  onSubmit: (selection: NotificationSelection) => Promise<void>;
}) {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Dialog {...overlay.rootProps}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button
                  disabled={props.isPending}
                  size="lg"
                  variant={props.isSubscribed ? "secondary" : "default"}
                >
                  <GetNotificationsButtonLabel
                    isLoading={props.isPending}
                    isSubscribed={props.isSubscribed}
                  />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p>{t("Pick what this device should receive.")}</p>
        </TooltipContent>
      </Tooltip>
      <DialogContent>
        <FormGuardProvider guard={overlay}>
          <ManagerNotificationChooserForm
            familyDefault={props.familyDefault}
            isPending={props.isPending}
            key={`${String(props.familyDefault)}:${String(props.messagesDefault)}`}
            messagesDefault={props.messagesDefault}
            onClose={overlay.close}
            onSubmit={props.onSubmit}
          />
        </FormGuardProvider>
      </DialogContent>
    </Dialog>
  );
}

function ManagerNotificationChooserForm(props: {
  familyDefault: boolean;
  isPending: boolean;
  messagesDefault: boolean;
  onClose: () => void;
  onSubmit: (selection: NotificationSelection) => Promise<void>;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {
      family: props.familyDefault,
      messages: props.messagesDefault,
    },
    schema: chooserSchema,
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onSubmit(values);
        props.onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("Choose notifications")}</DialogTitle>
        <DialogDescription>{t("Pick what this device should receive.")}</DialogDescription>
      </DialogHeader>
      <FieldSet className="mt-4">
        <FieldLegend className="sr-only">{t("Choose notifications")}</FieldLegend>
        <FieldGroup>
          <FormField
            control={form.control}
            name="family"
            render={(renderProps) => (
              <FormItem className="border-0 p-0">
                <Field orientation="horizontal">
                  <FormControl>
                    <Checkbox
                      checked={renderProps.field.value}
                      disabled={props.isPending}
                      id="notify-family"
                      onCheckedChange={(checked) => {
                        renderProps.field.onChange(checked === true);
                      }}
                    />
                  </FormControl>
                  <FieldContent>
                    <FieldTitle>
                      <label htmlFor="notify-family">{t("Status updates")}</label>
                    </FieldTitle>
                    <FieldDescription>
                      {t("Get notified when the baby's status changes")}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="messages"
            render={(renderProps) => (
              <FormItem className="border-0 p-0">
                <Field orientation="horizontal">
                  <FormControl>
                    <Checkbox
                      checked={renderProps.field.value}
                      disabled={props.isPending}
                      id="notify-messages"
                      onCheckedChange={(checked) => {
                        renderProps.field.onChange(checked === true);
                      }}
                    />
                  </FormControl>
                  <FieldContent>
                    <FieldTitle>
                      <label htmlFor="notify-messages">{t("Message notifications")}</label>
                    </FieldTitle>
                    <FieldDescription>
                      {t("Get notified when someone leaves a message")}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FormItem>
            )}
          />
        </FieldGroup>
      </FieldSet>
      <DialogFooter>
        <SubmitButton
          disabled={props.isPending}
          form="context"
          IconComponent={null}
          iconPosition="start"
        >
          {t("Save")}
        </SubmitButton>
      </DialogFooter>
    </Form>
  );
}

function GetNotificationsButtonLabel(props: { isLoading: boolean; isSubscribed: boolean }) {
  const { t } = useI18n();
  if (props.isSubscribed) {
    return (
      <>
        {props.isLoading ? <Spinner className="w-5 h-5" /> : <BellSlashIcon className="w-5 h-5" />}
        {t("Unsubscribe")}
      </>
    );
  }
  return (
    <>
      {props.isLoading ? <Spinner className="w-5 h-5" /> : <BellIcon className="w-5 h-5" />}
      {t("Get Notifications")}
    </>
  );
}

function NotificationSubscribeControls(props: {
  isLoading: boolean;
  isSubscribed: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const tooltip = props.isSubscribed
    ? "Stop receiving push notifications for updates"
    : "Get notified when the baby's status changes";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            disabled={props.isLoading}
            onClick={props.onClick}
            size="lg"
            variant={props.isSubscribed ? "secondary" : "default"}
          >
            <GetNotificationsButtonLabel
              isLoading={props.isLoading}
              isSubscribed={props.isSubscribed}
            />
          </Button>
        }
      />
      <TooltipContent>
        <p>{t(tooltip)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
