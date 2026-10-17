import type { ReactNode } from "react";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useMatchRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { ArrowLeftIcon, ShieldIcon } from "@phosphor-icons/react";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Switch } from "@workspace/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { useI18n } from "@/lib/i18n";
import { ADMIN_BABIES_DEFAULT_SEARCH } from "@/routes/_auth/dashboard_.admin/babies";

export const ADMIN_TABS = ["babies", "transfers", "users"] as const;

type AdminTab = (typeof ADMIN_TABS)[number];

export const Route = createFileRoute("/_auth/dashboard_/admin")({
  component: AdminDashboardPage,
  // Child loaders run alongside this route's loader, so the guard must run in
  // beforeLoad to stop them before any admin query is fetched.
  beforeLoad: (opts) => {
    if (!opts.context.isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
});

export function AdminDashboardPage() {
  const matchRoute = useMatchRoute();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();

  let tab: AdminTab = "babies";
  if (matchRoute({ to: "/dashboard/admin/transfers" })) {
    tab = "transfers";
  } else if (matchRoute({ to: "/dashboard/admin/users" })) {
    tab = "users";
  }

  return (
    <AdminDashboardView
      hideDemo={tab === "babies" ? (search.hideDemo ?? ADMIN_BABIES_DEFAULT_SEARCH.hideDemo) : null}
      onHideDemoChange={(hideDemo) => {
        void navigate({
          replace: true,
          resetScroll: false,
          search: (prev) => ({ ...prev, hideDemo }),
          to: "/dashboard/admin/babies",
        });
      }}
      tab={tab}
    >
      <Outlet />
    </AdminDashboardView>
  );
}

/**
 * Admin chrome: tab links, the hide-demo filter, and the active tab route's
 * body as `children`. URL state arrives as plain props, so tests can render it
 * without the child routes' search params or Convex pagination.
 *
 * @internal Exported for tests; production uses `AdminDashboardPage`.
 */
export function AdminDashboardView(props: {
  children: ReactNode;
  /** `null` hides the filter (only the babies tab has one). */
  hideDemo: boolean | null;
  onHideDemoChange: (hideDemo: boolean) => void;
  tab: AdminTab;
}) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background bg-dots">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Button
          className="w-fit"
          nativeButton={false}
          render={<Link to="/dashboard" />}
          size="sm"
          variant="outline"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("Back to Dashboard")}
        </Button>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <ShieldIcon className="size-5 text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  {t("Admin dashboard")}
                </CardTitle>
                <CardDescription>
                  {t("Review babies and users across the platform.")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
            <Tabs className="flex w-full flex-col gap-4" orientation="horizontal" value={props.tab}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList variant="default">
                  <TabsTrigger
                    nativeButton={false}
                    render={<Link replace resetScroll={false} to="/dashboard/admin/babies" />}
                    value="babies"
                  >
                    {t("All babies")}
                  </TabsTrigger>
                  <TabsTrigger
                    nativeButton={false}
                    render={<Link replace resetScroll={false} to="/dashboard/admin/transfers" />}
                    value="transfers"
                  >
                    {t("Transfer permalink")}
                  </TabsTrigger>
                  <TabsTrigger
                    nativeButton={false}
                    render={<Link replace resetScroll={false} to="/dashboard/admin/users" />}
                    value="users"
                  >
                    {t("Recent users")}
                  </TabsTrigger>
                </TabsList>

                {props.hideDemo === null ? null : (
                  <Field className="w-auto" orientation="horizontal">
                    <Switch
                      checked={props.hideDemo}
                      id="admin-hide-demo"
                      onCheckedChange={(hideDemo) => {
                        props.onHideDemoChange(hideDemo);
                      }}
                    />
                    <FieldLabel className="font-normal" htmlFor="admin-hide-demo">
                      {t("Hide demo babies")}
                    </FieldLabel>
                  </Field>
                )}
              </div>

              <TabsContent className="mt-0" value={props.tab}>
                {props.children}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
