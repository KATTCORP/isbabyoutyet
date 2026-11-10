import { BabyIcon, ShieldIcon, SignOutIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { QueryClient } from "@raf-query/react";
import { load, prefetch, swr, useQuery } from "@raf-query/react";
import type { ConvexQueryHandle } from "@workspace/convex-query";
import type { ConvexReactClient } from "convex/react";
import { useMutation } from "convex/react";
import { use, useRef } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@workspace/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item";
import { Switch } from "@workspace/ui/components/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { AccountSettings } from "@/components/account-settings";
import { IosPwaInstallPrompt } from "@/components/baby/notification-subscribe";
import { Form, FormGuardProvider, SubmitButton, useZodForm } from "@/components/Form";
import { LanguageSettings } from "@/components/language-settings";
import { signOutThenGo } from "@/lib/auth-client";
import { adminBrowserPushCapabilityQuery } from "@/lib/browser-push-capability";
import { convexQuery } from "@workspace/convex-query";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { useI18n } from "@/lib/i18n";
import { useDashboardSettingsOverlay } from "@/lib/overlay-nav";
import type { OverlayControl } from "@/lib/overlay-nav";
import type { AdminBrowserPushHandle } from "@/lib/use-browser-push-capability";
import { useAdminBrowserPushCapability } from "@/lib/use-browser-push-capability";
import { usePendingAction } from "@/lib/use-pending-action";
import { ensureWebPushSubscription, readWebPushSubscription } from "@/lib/web-push-subscription";

export const Route = createFileRoute("/_auth/dashboard/settings")({
  loader: async (opts) => {
    if (!opts.context.isAdmin) {
      return { adminPush: null };
    }
    const queryClient = opts.context.queryClient;
    const [handles] = await load(queryClient, {
      browserPush: prefetch(adminBrowserPushCapabilityQuery),
      vapidPublicKey: swr(convexQuery(api.pushSubscriptions.getPublicKey), {}),
    });
    return {
      adminPush: { browserPush: handles.browserPush, vapidPublicKey: handles.vapidPublicKey },
    };
  },
  component: DashboardSettingsRoute,
});

export function DashboardSettingsRoute() {
  const context = Route.useRouteContext();
  const loaderData = Route.useLoaderData();

  return (
    <DashboardSettingsSheet
      adminPush={loaderData.adminPush}
      convexClient={context.convexClient}
      profile={context.me}
      queryClient={context.queryClient}
    />
  );
}

type AdminPushLoaderData = {
  /** This device's admin push state, started by the loader (`ssr: false`). */
  browserPush: AdminBrowserPushHandle;
  vapidPublicKey: ConvexQueryHandle<typeof api.pushSubscriptions.getPublicKey>;
};

function SettingsSection(props: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {props.title}
      </h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card/50">
        <ItemGroup className="gap-0">{props.children}</ItemGroup>
      </div>
    </section>
  );
}

/**
 * Convex-wired sheet: resolves the admin flag from the preloaded profile and
 * owns sign-out.
 *
 * @internal exported for tests
 */
export function DashboardSettingsSheet(props: {
  adminPush: AdminPushLoaderData | null;
  convexClient: ConvexReactClient;
  profile: ConvexQueryHandle<typeof api.profile.get>;
  queryClient: QueryClient;
}) {
  const [profileThenable] = useQuery(convexQuery(api.profile.get), props.profile);
  const profile = use(profileThenable);
  const settings = useDashboardSettingsOverlay();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <DashboardSettingsSheetView
      accountSettings={<AccountSettings profile={props.profile} />}
      adminNotifications={props.adminPush ? <AdminNewBabyPushSwitch {...props.adminPush} /> : null}
      isAdmin={profile?.isAdmin === true}
      languageSettings={<LanguageSettings profile={props.profile} />}
      onSignOut={async () => {
        try {
          await signOutThenGo({
            convexClient: props.convexClient,
            navigate: () =>
              router.navigate({
                to: "/",
              }),
            queryClient: props.queryClient,
            t,
          });
        } catch (error) {
          if (error instanceof Error) {
            toast.error(error.message);
            return;
          }
          throw error;
        }
      }}
      overlay={settings}
    />
  );
}

/**
 * Presentational sheet — no Convex, no auth client, no route context — so the
 * layout, admin gating, and log-out wiring are testable in isolation.
 *
 * @internal exported for tests
 */
export function DashboardSettingsSheetView(props: {
  accountSettings: ReactNode;
  /** This device's new-baby push switch; only rendered for admins. */
  adminNotifications: ReactNode;
  isAdmin: boolean;
  languageSettings: ReactNode;
  onSignOut: () => void | Promise<void>;
  overlay: OverlayControl;
}) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);

  return (
    <Sheet {...props.overlay.rootProps}>
      <SheetContent
        className="w-full sm:max-w-sm"
        initialFocus={contentRef}
        ref={contentRef}
        side="right"
      >
        <FormGuardProvider guard={props.overlay.guard}>
          <SheetHeader>
            <SheetTitle>{t("Settings")}</SheetTitle>
            <SheetDescription>{t("Manage your profile and app preferences.")}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
            <SettingsSection title={t("Account")}>
              {props.accountSettings}
              {props.languageSettings}
            </SettingsSection>

            {props.isAdmin ? (
              <SettingsSection title={t("Admin")}>
                {props.adminNotifications}
                <Item render={<Link preload="viewport" to="/dashboard/admin/babies" />}>
                  <ItemMedia variant="icon">
                    <ShieldIcon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t("Admin dashboard")}</ItemTitle>
                  </ItemContent>
                </Item>
              </SettingsSection>
            ) : null}
          </div>

          <SheetFooter>
            <SignOutForm onSignOut={props.onSignOut} />
          </SheetFooter>
        </FormGuardProvider>
      </SheetContent>
    </Sheet>
  );
}

function SignOutForm(props: { onSignOut: () => void | Promise<void> }) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {},
    schema: z.object({}),
  });

  return (
    <Form
      form={form}
      handleSubmit={async () => {
        await props.onSignOut();
      }}
    >
      <SubmitButton form="context" IconComponent={SignOutIcon} iconPosition="start">
        {t("Logout")}
      </SubmitButton>
    </Form>
  );
}

type AdminPushDisabledReason = "unsupported" | "needsIosInstall";

function adminNewBabyPushCopy(opts: {
  checked: boolean;
  disabledReason: AdminPushDisabledReason | null;
}) {
  if (opts.disabledReason === "needsIosInstall") {
    return "On iPhone, new baby alerts need this dashboard on your Home Screen. Add it, then turn them on from the icon.";
  }
  if (opts.disabledReason === "unsupported") {
    return "Push notifications are not supported in this browser.";
  }
  return opts.checked
    ? "This device gets a push for every new baby page."
    : "Get a push on this device whenever someone creates a baby page.";
}

/**
 * Admin-only row: push this device whenever a baby page is created.
 *
 * @internal exported for tests
 */
export function AdminNewBabyPushSwitchView(props: {
  checked: boolean;
  disabled: boolean;
  disabledReason: AdminPushDisabledReason | null;
  onCheckedChange: ((checked: boolean) => void) | null;
}) {
  const { t } = useI18n();
  const titleId = "admin-new-baby-push-title";

  return (
    <Item>
      <ItemMedia variant="icon">
        <BabyIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle id={titleId}>{t("New baby alerts")}</ItemTitle>
        <ItemDescription>{t(adminNewBabyPushCopy(props))}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {props.disabledReason === "needsIosInstall" ? (
          <IosPwaInstallPrompt
            audience="owner"
            trigger={
              <Button size="sm" type="button" variant="outline">
                {t("Get Notifications")}
              </Button>
            }
          />
        ) : (
          <Switch
            aria-labelledby={titleId}
            checked={props.checked}
            disabled={props.disabled || props.onCheckedChange === null}
            onCheckedChange={(checked) => {
              props.onCheckedChange?.(checked);
            }}
          />
        )}
      </ItemActions>
    </Item>
  );
}

function AdminNewBabyPushSwitch(props: AdminPushLoaderData) {
  const { t } = useI18n();
  const [capability, refetchCapability] = useAdminBrowserPushCapability(props.browserPush);
  const [vapidPublicKeyThenable] = useQuery(
    convexQuery(api.pushSubscriptions.getPublicKey),
    props.vapidPublicKey,
  );
  const vapidPublicKey = use(vapidPublicKeyThenable);
  const [isPending, runAction] = usePendingAction();
  const subscribeMutationFn = useMutation(api.adminPushSubscriptions.subscribe);
  const unsubscribeMutationFn = useMutation(api.adminPushSubscriptions.unsubscribe);

  const subscribe = () =>
    runAction(async () => {
      const keys = await ensureWebPushSubscription(vapidPublicKey, { t });
      await subscribeMutationFn({ ...keys, userAgent: navigator.userAgent });
      await refetchCapability();
    });

  const unsubscribe = () =>
    runAction(async () => {
      const keys = await readWebPushSubscription();
      if (keys) {
        await unsubscribeMutationFn(keys);
      }
      await refetchCapability();
    });

  const disabledReason =
    capability?.kind === "needsIosInstall" || capability?.kind === "unsupported"
      ? capability.kind
      : null;

  return (
    <AdminNewBabyPushSwitchView
      checked={capability?.kind === "subscribed"}
      disabled={
        isPending ||
        capability === null ||
        disabledReason !== null ||
        capability.kind === "serviceWorkerTimeout"
      }
      disabledReason={disabledReason}
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
