import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CaretDown, CaretUp, Shield, Translate } from "@phosphor-icons/react";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { allKeyed } from "@workspace/query-prefetch";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@workspace/ui/components/empty";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Spinner } from "@workspace/ui/components/spinner";
import { Switch } from "@workspace/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import { z } from "zod";
import {
  getConvexQueryPreloader,
  usePreloadedConvexInfiniteQuery,
} from "@workspace/convex-prefetch";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

const ADMIN_PAGE_SIZE = 20;

const adminSearchSchema = z.object({
  tab: z.enum(["babies", "languages"]).default("babies"),
  sort: z.enum(["created", "updated"]).default("updated"),
  order: z.enum(["asc", "desc"]).default("desc"),
  hideDemo: z.boolean().default(true),
});

type AdminTab = z.infer<typeof adminSearchSchema>["tab"];
type SortBy = z.infer<typeof adminSearchSchema>["sort"];
type SortOrder = z.infer<typeof adminSearchSchema>["order"];
type AdminSearch = z.infer<typeof adminSearchSchema>;

/** Default admin babies list: newest updates first, demos hidden. */
export const ADMIN_DEFAULT_SEARCH = {
  tab: "babies",
  sort: "updated",
  order: "desc",
  hideDemo: true,
} as const satisfies AdminSearch;

type LanguageRequestRow = {
  _id: string;
  requestedLocale: string;
  createdAt: number;
  userId: string;
  userEmail: string | null;
};

type BabyRow = {
  _id: string;
  name: string;
  publicId: string;
  status: "not_yet" | "labor_started" | "gone_to_hospital" | "born";
  demo: boolean;
  createdAt: number;
  updatedAt: number;
  managerEmails: string[];
};

export const Route = createFileRoute("/_auth/dashboard/admin")({
  component: AdminDashboardPage,
  validateSearch: adminSearchSchema,
  loaderDeps: (opts) => opts.search,
  beforeLoad: async (opts) => {
    const preloader = getConvexQueryPreloader(opts.context.queryClient);
    const profile = await preloader.ensureQueryData(api.profile.get, {});
    if (!profile.initialData?.isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async (opts) => {
    const preloader = getConvexQueryPreloader(opts.context.queryClient);
    const search = opts.deps;
    // Infinite queries stay blocking on the client too: the react-query cache
    // makes revisits free, and suspense churn on paginated tables isn't worth it.
    return await allKeyed({
      babies: preloader.ensureInfiniteQueryData(api.admin.listBabies, {
        args: {
          sortBy: search.sort,
          sortOrder: search.order,
          hideDemo: search.hideDemo,
        },
        numItems: ADMIN_PAGE_SIZE,
      }),
      languages: preloader.ensureInfiniteQueryData(api.admin.listLanguageRequests, {
        args: {},
        numItems: ADMIN_PAGE_SIZE,
      }),
    });
  },
});

export function statusLabel(status: BabyRow["status"], t: TranslationFunction) {
  switch (status) {
    case "not_yet":
      return t("Not yet");
    case "labor_started":
      return t("Labour started");
    case "gone_to_hospital":
      return t("Gone to hospital");
    case "born":
      return t("Baby born");
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function formatWhen(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

/**
 * Next URL sort state when a sortable column header is clicked.
 * Selecting a column always starts at desc; clicking the active desc column
 * toggles to asc.
 */
export function nextSortSearch(opts: {
  currentSort: SortBy;
  currentOrder: SortOrder;
  clicked: SortBy;
}) {
  if (opts.clicked === opts.currentSort && opts.currentOrder === "desc") {
    return { sort: opts.clicked, order: "asc" as SortOrder };
  }
  return { sort: opts.clicked, order: "desc" as SortOrder };
}

function InfiniteScrollSentinel(props: { canLoadMore: boolean; onLoadMore: () => void }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.canLoadMore) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          props.onLoadMore();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => {
      observer.unobserve(node);
    };
  }, [props.canLoadMore, props.onLoadMore]);

  return <div ref={loadMoreRef} className="h-8 w-full" aria-hidden="true" />;
}

function AdminTableCard(props: {
  children: ReactNode;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <Card className="relative gap-0 py-0">
      <CardContent className="p-0">{props.children}</CardContent>
      <InfiniteScrollSentinel canLoadMore={props.canLoadMore} onLoadMore={props.onLoadMore} />
      {props.isLoadingMore ? (
        <div className="flex justify-center border-t py-3">
          <Spinner className="size-5 text-primary" />
        </div>
      ) : null}
    </Card>
  );
}

function SortableHeaderLink(props: {
  label: string;
  column: SortBy;
  sort: SortBy;
  order: SortOrder;
  tab: AdminTab;
  hideDemo: boolean;
}) {
  const active = props.column === props.sort;
  const next = nextSortSearch({
    currentSort: props.sort,
    currentOrder: props.order,
    clicked: props.column,
  });
  const SortIcon = active && props.order === "asc" ? CaretUp : CaretDown;

  return (
    <TableHead>
      <Link
        to="/dashboard/admin"
        search={{
          tab: props.tab,
          sort: next.sort,
          order: next.order,
          hideDemo: props.hideDemo,
        }}
        replace
        className={cn(
          "inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {props.label}
        <SortIcon
          data-icon="inline-end"
          className={cn("opacity-0", active && "opacity-100")}
          aria-hidden="true"
        />
      </Link>
    </TableHead>
  );
}

export function LanguageRequestsSection(props: {
  requests: LanguageRequestRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const { t, locale } = useI18n();

  if (props.requests.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Translate />
          </EmptyMedia>
          <EmptyTitle>{t("No language requests yet")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <AdminTableCard
      canLoadMore={props.hasNextPage && !props.isFetchingNextPage}
      isLoadingMore={props.isFetchingNextPage}
      onLoadMore={props.onLoadMore}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Language")}</TableHead>
            <TableHead>{t("Requester")}</TableHead>
            <TableHead>{t("Created")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.requests.map((request) => (
            <TableRow key={request._id}>
              <TableCell className="font-medium">{request.requestedLocale}</TableCell>
              <TableCell>{request.userEmail ?? request.userId}</TableCell>
              <TableCell>{formatWhen(request.createdAt, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTableCard>
  );
}

export function BabiesSection(props: {
  babies: BabyRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  sort: SortBy;
  order: SortOrder;
  tab: AdminTab;
  hideDemo: boolean;
  onLoadMore: () => void;
}) {
  const { t, locale } = useI18n();

  return (
    <AdminTableCard
      canLoadMore={props.hasNextPage && !props.isFetchingNextPage}
      isLoadingMore={props.isFetchingNextPage}
      onLoadMore={props.onLoadMore}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Name")}</TableHead>
            <TableHead>{t("Status")}</TableHead>
            <TableHead>{t("Managers")}</TableHead>
            <SortableHeaderLink
              label={t("Created")}
              column="created"
              sort={props.sort}
              order={props.order}
              tab={props.tab}
              hideDemo={props.hideDemo}
            />
            <SortableHeaderLink
              label={t("Updated")}
              column="updated"
              sort={props.sort}
              order={props.order}
              tab={props.tab}
              hideDemo={props.hideDemo}
            />
            <TableHead>
              <span className="sr-only">{t("Open")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.babies.map((baby) => (
            <TableRow key={baby._id}>
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-2">
                  {baby.name}
                  {baby.demo ? <Badge variant="outline">{t("Demo")}</Badge> : null}
                </span>
              </TableCell>
              <TableCell>{statusLabel(baby.status, t)}</TableCell>
              <TableCell className="max-w-xs whitespace-normal">
                {baby.managerEmails.join(", ")}
              </TableCell>
              <TableCell>{formatWhen(baby.createdAt, locale)}</TableCell>
              <TableCell>{formatWhen(baby.updatedAt, locale)}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link to="/baby/$publicId" params={{ publicId: baby.publicId }} />}
                  nativeButton={false}
                >
                  {t("Open")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTableCard>
  );
}

function AdminBabiesTab() {
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const babiesQuery = usePreloadedConvexInfiniteQuery(api.admin.listBabies, {
    handle: loaderData.babies,
    remixArgs: null,
  });

  const babies = babiesQuery.data.pages.flatMap((page) => page.page);

  return (
    <BabiesSection
      babies={babies}
      hasNextPage={babiesQuery.hasNextPage}
      isFetchingNextPage={babiesQuery.isFetchingNextPage}
      sort={search.sort}
      order={search.order}
      tab={search.tab}
      hideDemo={search.hideDemo}
      onLoadMore={() => {
        void babiesQuery.fetchNextPage();
      }}
    />
  );
}

function AdminLanguagesTab() {
  const loaderData = Route.useLoaderData();
  const languagesQuery = usePreloadedConvexInfiniteQuery(api.admin.listLanguageRequests, {
    handle: loaderData.languages,
    remixArgs: null,
  });

  const requests = languagesQuery.data.pages.flatMap((page) => page.page);

  return (
    <LanguageRequestsSection
      requests={requests}
      hasNextPage={languagesQuery.hasNextPage}
      isFetchingNextPage={languagesQuery.isFetchingNextPage}
      onLoadMore={() => {
        void languagesQuery.fetchNextPage();
      }}
    />
  );
}

export function AdminDashboardPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/admin" });

  function setTab(tab: AdminTab) {
    void navigate({
      search: (prev) => ({ ...prev, tab }),
      replace: true,
    });
  }

  const tabSearch = (tab: AdminTab): AdminSearch => ({
    tab,
    sort: search.sort,
    order: search.order,
    hideDemo: search.hideDemo,
  });

  return (
    <div className="min-h-screen bg-background bg-dots">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          render={<Link to="/dashboard" />}
          nativeButton={false}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("Back to Dashboard")}
        </Button>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <Shield className="size-5 text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  {t("Admin dashboard")}
                </CardTitle>
                <CardDescription>
                  {t("Review babies and language requests across the platform.")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
            <Tabs
              value={search.tab}
              orientation="horizontal"
              className="flex w-full flex-col gap-4"
              onValueChange={(value) => {
                if (value === "babies" || value === "languages") {
                  setTab(value);
                }
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList variant="default">
                  <TabsTrigger
                    value="babies"
                    nativeButton={false}
                    render={<Link to="/dashboard/admin" search={tabSearch("babies")} replace />}
                  >
                    {t("All babies")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="languages"
                    nativeButton={false}
                    render={<Link to="/dashboard/admin" search={tabSearch("languages")} replace />}
                  >
                    {t("Requested languages")}
                  </TabsTrigger>
                </TabsList>

                {search.tab === "babies" ? (
                  <Field orientation="horizontal" className="w-auto">
                    <Switch
                      id="admin-hide-demo"
                      checked={search.hideDemo}
                      onCheckedChange={(hideDemo) => {
                        void navigate({
                          search: (prev) => ({ ...prev, hideDemo }),
                          replace: true,
                        });
                      }}
                    />
                    <FieldLabel htmlFor="admin-hide-demo" className="font-normal">
                      {t("Hide demo babies")}
                    </FieldLabel>
                  </Field>
                ) : null}
              </div>

              <TabsContent value="babies" className="mt-0">
                {search.tab === "babies" ? <AdminBabiesTab /> : null}
              </TabsContent>

              <TabsContent value="languages" className="mt-0">
                {search.tab === "languages" ? <AdminLanguagesTab /> : null}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
