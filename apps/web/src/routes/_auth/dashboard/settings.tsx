import { ShieldIcon, SignOutIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { ConvexReactClient } from "convex/react";
import { useRef } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@workspace/convex/convex/_generated/api";
import type { PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@workspace/ui/components/item";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { AccountSettings } from "@/components/account-settings";
import { Form, FormGuardProvider, SubmitButton, useZodForm } from "@/components/Form";
import { LanguageSettings } from "@/components/language-settings";
import { signOutThenGo } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { useDashboardSettingsOverlay } from "@/lib/overlay-nav";
import type { OverlayControl } from "@/lib/overlay-nav";
import { ADMIN_DEFAULT_SEARCH } from "@/routes/_auth/dashboard_.admin";

export const Route = createFileRoute("/_auth/dashboard/settings")({
  component: DashboardSettingsRoute,
});

export function DashboardSettingsRoute() {
  const context = Route.useRouteContext();

  return (
    <DashboardSettingsSheet
      convexClient={context.convexClient}
      convexQueryClient={context.convexQueryClient}
      profile={context.profile}
      queryClient={context.queryClient}
    />
  );
}

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
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
  profile: PreloadedConvexQuery<typeof api.profile.get>;
  queryClient: QueryClient;
}) {
  const profileQuery = usePreloadedConvexQuery(api.profile.get, props.profile);
  const settings = useDashboardSettingsOverlay();
  const { t } = useI18n();
  const router = useRouter();

  return (
    <DashboardSettingsSheetView
      accountSettings={<AccountSettings profile={props.profile} />}
      isAdmin={profileQuery.data?.isAdmin === true}
      languageSettings={<LanguageSettings profile={props.profile} />}
      onSignOut={async () => {
        try {
          await signOutThenGo({
            convexClient: props.convexClient,
            convexQueryClient: props.convexQueryClient,
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
                <Item
                  render={
                    <Link preload="viewport" search={ADMIN_DEFAULT_SEARCH} to="/dashboard/admin" />
                  }
                >
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
