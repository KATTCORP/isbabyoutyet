import { ShieldIcon, SignOutIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef } from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import { api } from "@workspace/convex/convex/_generated/api";
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
import { ADMIN_DEFAULT_SEARCH } from "@/routes/_auth/dashboard_.admin";

export const Route = createFileRoute("/_auth/dashboard/settings")({
  component: DashboardSettingsRoute,
});

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

/** Route-backed settings sheet over the dashboard; admin link from the live profile. */
function DashboardSettingsRoute() {
  const context = Route.useRouteContext();
  const profileQuery = usePreloadedConvexQuery(api.profile.get, context.profile);
  const settings = useDashboardSettingsOverlay();
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);

  return (
    <Sheet {...settings.rootProps}>
      <SheetContent
        className="w-full sm:max-w-sm"
        initialFocus={contentRef}
        ref={contentRef}
        side="right"
      >
        <FormGuardProvider guard={settings.guard}>
          <SheetHeader>
            <SheetTitle>{t("Settings")}</SheetTitle>
            <SheetDescription>{t("Manage your profile and app preferences.")}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
            <SettingsSection title={t("Account")}>
              <AccountSettings profile={context.profile} />
              <LanguageSettings profile={context.profile} />
            </SettingsSection>

            {profileQuery.data?.isAdmin === true ? (
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
            <SignOutForm />
          </SheetFooter>
        </FormGuardProvider>
      </SheetContent>
    </Sheet>
  );
}

function SignOutForm() {
  const context = Route.useRouteContext();
  const router = useRouter();
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {},
    schema: z.object({}),
  });

  return (
    <Form
      form={form}
      handleSubmit={async () => {
        await signOutThenGo({
          convexClient: context.convexClient,
          convexQueryClient: context.convexQueryClient,
          navigate: () => router.navigate({ to: "/" }),
          queryClient: context.queryClient,
          t,
        });
      }}
    >
      <SubmitButton form="context" IconComponent={SignOutIcon} iconPosition="start">
        {t("Logout")}
      </SubmitButton>
    </Form>
  );
}
