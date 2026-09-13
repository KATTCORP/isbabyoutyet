import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Spinner } from "@workspace/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";
import { Bell, BellSlash, Export } from "@phosphor-icons/react";
import { Suspense } from "react";
import { toast } from "sonner";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { useInitiateConvexQuery, usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { useI18n } from "@/lib/i18n";

type NotificationSubscribeProps = {
  babyId: Id<"baby">;
  vapidPublicKey: string;
};

// Detect iOS Safari not running as PWA
function getIOSStatus() {
  if (typeof window === "undefined") return { isIOS: false, isStandalone: false };

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream: unknown | undefined }).MSStream;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone: boolean | undefined }).standalone === true;

  return { isIOS, isStandalone };
}

// Wait for service worker with timeout
async function waitForServiceWorkerWithTimeout(timeoutMs: number) {
  const timeoutPromise = new Promise<null>((_resolve, reject) => {
    setTimeout(() => reject(new Error("Service worker ready timeout")), timeoutMs);
  });

  return Promise.race([navigator.serviceWorker.ready, timeoutPromise]);
}

export function NotificationSubscribe(props: NotificationSubscribeProps) {
  const { t } = useI18n();
  const { babyId } = props;

  // Check iOS status (browser-only; not a Convex query)
  const iosStatusQuery = useQuery({
    queryKey: ["iosStatus"],
    queryFn: () => getIOSStatus(),
  });
  const iosStatus = iosStatusQuery.data ?? { isIOS: false, isStandalone: false };
  const needsIOSInstall = iosStatus.isIOS && !iosStatus.isStandalone;

  // Check basic push notification support (browser-only)
  const isSupportedQuery = useQuery({
    queryKey: ["isSupported"],
    queryFn: async () => {
      return (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
      );
    },
  });
  const isSupported = isSupportedQuery.data ?? false;

  // Get browser subscription endpoint with timeout (browser-only)
  const pushSubscriptionQuery = useQuery({
    queryKey: ["browserSubscription"],
    queryFn: async () => {
      try {
        const registration = await waitForServiceWorkerWithTimeout(5000);
        if (!registration) return null;
        return await registration.pushManager.getSubscription();
      } catch {
        // Service worker not ready (common on iOS Safari non-PWA)
        return null;
      }
    },
    enabled: isSupported && !needsIOSInstall,
  });

  const subscribeMutationFn = useConvexMutation(api.pushSubscriptions.subscribe);
  const unsubscribeMutationFn = useConvexMutation(api.pushSubscriptions.unsubscribe);

  // Subscribe mutation (TanStack mutation that handles browser permission + Convex)
  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!isSupported) {
        throw new Error(t("Push notifications are not supported in this browser."));
      }

      // Request permission
      if (Notification.permission === "default") {
        const permissionResult = await Notification.requestPermission();

        if (permissionResult !== "granted") {
          throw new Error(t("Notification permission denied"));
        }
      } else if (Notification.permission !== "granted") {
        throw new Error(t("Notification permission is required"));
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(props.vapidPublicKey);
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      // Save subscription to Convex
      const subscriptionData = pushSubscription.toJSON();
      if (
        subscriptionData.endpoint &&
        subscriptionData.keys?.p256dh &&
        subscriptionData.keys?.auth
      ) {
        return await subscribeMutationFn({
          babyId,
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.keys.p256dh,
          auth: subscriptionData.keys.auth,
          userAgent: navigator.userAgent,
        });
      }

      throw new Error(t("Failed to get subscription data"));
    },
    onSuccess: () => {
      void pushSubscriptionQuery.refetch();
    },
  });

  // Unsubscribe mutation (TanStack mutation wrapping Convex mutation)
  const unsubscribeMutation = useMutation<unknown, Error, PushSubscription>({
    mutationFn: async (subscription) => {
      const subscriptionData = subscription.toJSON();
      if (
        !subscriptionData.endpoint ||
        !subscriptionData.keys?.p256dh ||
        !subscriptionData.keys.auth
      ) {
        throw new Error(t("Failed to get subscription data"));
      }
      return await unsubscribeMutationFn({
        babyId,
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.keys.p256dh,
        auth: subscriptionData.keys.auth,
      });
    },
    onSuccess: () => {
      void pushSubscriptionQuery.refetch();
    },
  });

  const isLoading = subscribeMutation.isPending || unsubscribeMutation.isPending;

  // Show iOS installation guide
  if (needsIOSInstall) {
    return (
      <Dialog>
        <Tooltip>
          <TooltipTrigger
            render={
              <DialogTrigger
                render={
                  <Button variant="default" size="lg">
                    <Bell className="w-5 h-5" />
                    {t("Get Notifications")}
                  </Button>
                }
              />
            }
          />
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
          <ol className="list-decimal list-inside space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-5">1.</span>
              <span>
                {t("Tap the Share button in Safari")} <Export className="inline w-4 h-4 mx-1" />
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
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-5">4.</span>
              <span>{t('Come back here and tap "Get Notifications"')}</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    );
  }

  const endpoint = pushSubscriptionQuery.data?.endpoint;

  return (
    <Suspense
      fallback={
        <Button variant="default" size="lg" disabled>
          <Spinner className="w-5 h-5" />
          {t("Get Notifications")}
        </Button>
      }
    >
      <NotificationSubscribeButton
        babyId={babyId}
        endpoint={endpoint ?? null}
        isLoading={isLoading}
        onSubscribe={() => {
          toast.promise(subscribeMutation.mutateAsync(), {
            loading: t("Subscribing to notifications..."),
            success: t("Subscribed to notifications!"),
            error: (error) =>
              error instanceof Error ? error.message : t("Failed to subscribe to notifications"),
          });
        }}
        onUnsubscribe={() => {
          const subscription = pushSubscriptionQuery.data;
          if (!subscription) {
            toast.error(t("No subscription endpoint found"));
            return;
          }
          toast.promise(unsubscribeMutation.mutateAsync(subscription), {
            loading: t("Unsubscribing from notifications..."),
            success: t("Unsubscribed from notifications!"),
            error: (error) =>
              error instanceof Error
                ? error.message
                : t("Failed to unsubscribe from notifications"),
          });
          void pushSubscriptionQuery.refetch();
        }}
      />
    </Suspense>
  );
}

function NotificationSubscribeButton(props: {
  babyId: Id<"baby">;
  endpoint: string | null;
  isLoading: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}) {
  // Only suspend on the Convex subscription check when we have an endpoint
  if (props.endpoint) {
    return <NotificationSubscribeButtonWithStatus {...props} endpoint={props.endpoint} />;
  }

  return (
    <NotificationSubscribeControls
      isSubscribed={false}
      isLoading={props.isLoading}
      onClick={() => {
        props.onSubscribe();
      }}
    />
  );
}

function NotificationSubscribeButtonWithStatus(props: {
  babyId: Id<"baby">;
  endpoint: string;
  isLoading: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}) {
  const isSubscribedHandle = useInitiateConvexQuery(api.pushSubscriptions.isSubscribed, {
    babyId: props.babyId,
    endpoint: props.endpoint,
  });
  const isSubscribedQuery = usePreloadedConvexQuery(
    api.pushSubscriptions.isSubscribed,
    isSubscribedHandle,
  );
  const isSubscribed = isSubscribedQuery.data;

  return (
    <NotificationSubscribeControls
      isSubscribed={isSubscribed}
      isLoading={props.isLoading}
      onClick={() => {
        if (isSubscribed) {
          props.onUnsubscribe();
        } else {
          props.onSubscribe();
        }
      }}
    />
  );
}

function NotificationSubscribeControls(props: {
  isSubscribed: boolean;
  isLoading: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            onClick={props.onClick}
            disabled={props.isLoading}
            variant={props.isSubscribed ? "secondary" : "default"}
            size="lg"
          >
            {props.isSubscribed ? (
              <>
                {props.isLoading ? (
                  <Spinner className="w-5 h-5" />
                ) : (
                  <BellSlash className="w-5 h-5" />
                )}
                {t("Unsubscribe")}
              </>
            ) : (
              <>
                {props.isLoading ? <Spinner className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                {t("Get Notifications")}
              </>
            )}
          </Button>
        }
      />
      <TooltipContent>
        <p>
          {props.isSubscribed
            ? t("Stop receiving push notifications for updates")
            : t("Get notified when the baby's status changes")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

// Convert VAPID key from base64 URL to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
