import type { ReactNode } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowsLeftRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  ShieldIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
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
import { Input } from "@workspace/ui/components/input";
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
import { usePreloadedConvexInfiniteQuery } from "@workspace/convex-prefetch";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Form, SubmitButton, useZodForm } from "@/components/Form";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { useIntersectionAction } from "@/lib/use-intersection-action";

const ADMIN_PAGE_SIZE = 20;

const adminSearchSchema = z.object({
  hideDemo: z.boolean().default(true),
  order: z.enum(["asc", "desc"]).default("desc"),
  sort: z.enum(["created", "updated"]).default("created"),
  tab: z.enum(["babies", "transfers", "users"]).default("babies"),
});

type AdminTab = z.infer<typeof adminSearchSchema>["tab"];
type SortBy = z.infer<typeof adminSearchSchema>["sort"];
type SortOrder = z.infer<typeof adminSearchSchema>["order"];
type AdminSearch = z.infer<typeof adminSearchSchema>;

/** Default admin babies list: newest created first, demos hidden. */
export const ADMIN_DEFAULT_SEARCH = {
  hideDemo: true,
  order: "desc",
  sort: "created",
  tab: "babies",
} as const satisfies AdminSearch;

type BabyRow = {
  _id: string;
  createdAt: number;
  demo: boolean;
  managerEmails: Array<string>;
  name: string;
  publicId: string;
  status: "not_yet" | "labor_started" | "gone_to_hospital" | "born";
  updatedAt: number;
};

type PublicIdTransferRow = {
  _id: string;
  actorEmail: string | null;
  actorUserId: string;
  babyName: string;
  createdAt: number;
  displacedPublicId: string | null;
  fromPublicId: string;
  motivation: string;
  toPublicId: string;
};

type UserRow = {
  _id: string;
  babies: Array<{
    demo: boolean;
    name: string;
    publicId: string;
  }>;
  createdAt: number;
  email: string;
  name: string;
};

export const Route = createFileRoute("/_auth/dashboard_/admin")({
  component: AdminDashboardPage,
  validateSearch: adminSearchSchema,
  loaderDeps: (opts) => opts.search,
  loader: async (opts) => {
    if (!opts.context.profile.initialData?.isAdmin) {
      throw redirect({ to: "/dashboard" });
    }

    const preloader = opts.context.convexPreloader;
    const search = opts.deps;
    // Infinite queries stay blocking on the client too: the react-query cache
    // makes revisits free, and suspense churn on paginated tables isn't worth it.
    return await allKeyed({
      babies: preloader.ensureInfiniteQueryData(api.admin.listBabies, {
        args: {
          hideDemo: search.hideDemo,
          sortBy: search.sort,
          sortOrder: search.order,
        },
        numItems: ADMIN_PAGE_SIZE,
      }),
      transfers: preloader.ensureInfiniteQueryData(api.admin.listPublicIdTransfers, {
        args: {},
        numItems: ADMIN_PAGE_SIZE,
      }),
      users: preloader.ensureInfiniteQueryData(api.admin.listUsers, {
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
type NextSortSearch = {
  order: SortOrder;
  sort: SortBy;
};

export function nextSortSearch(opts: {
  clicked: SortBy;
  currentOrder: SortOrder;
  currentSort: SortBy;
}): NextSortSearch {
  if (opts.clicked === opts.currentSort && opts.currentOrder === "desc") {
    return { order: "asc", sort: opts.clicked };
  }
  return { order: "desc", sort: opts.clicked };
}

export type TransferPublicIdValues = {
  fromPublicId: string;
  motivation: string;
  toPublicId: string;
};

function transferPublicIdSchema(t: TranslationFunction) {
  return z.object({
    fromPublicId: z.string().trim().min(1, t("Current permalink is required")),
    motivation: z.string().trim().min(1, t("Motivation is required")),
    toPublicId: z.string().trim().min(1, t("New permalink is required")),
  });
}

/**
 * Staff form to move a baby page to a different public URL, recording history
 * so the old slug redirects. @internal Exported for tests.
 */
export function TransferPublicIdForm(props: {
  onTransfer: (values: TransferPublicIdValues) => Promise<void>;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {
      fromPublicId: "",
      motivation: "",
      toPublicId: "",
    },
    schema: transferPublicIdSchema(t),
  });

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex flex-col gap-1">
        <h3 className="font-medium">{t("Transfer permalink")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("Give a baby page a different public URL. Old links keep working.")}
        </p>
      </div>
      <Form
        form={form}
        handleSubmit={async (values) => {
          await props.onTransfer(values);
          form.reset();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="fromPublicId"
            render={(renderProps) => (
              <FormItem>
                <FormLabel>{t("Current permalink")}</FormLabel>
                <FormControl>
                  <Input placeholder="baby-2" {...renderProps.field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="toPublicId"
            render={(renderProps) => (
              <FormItem>
                <FormLabel>{t("New permalink")}</FormLabel>
                <FormControl>
                  <Input placeholder="baby" {...renderProps.field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="motivation"
          render={(renderProps) => (
            <FormItem className="mt-3">
              <FormLabel>{t("Motivation")}</FormLabel>
              <FormControl>
                <Textarea className="min-h-20" {...renderProps.field} />
              </FormControl>
              <FormDescription>{t("Why this permalink is being moved.")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="mt-3">
          <SubmitButton form="context" IconComponent={null} iconPosition="start">
            {t("Transfer")}
          </SubmitButton>
        </div>
      </Form>
    </div>
  );
}

/**
 * Newest permalink transfers first. @internal Exported for tests.
 */
export function PermalinkTransfersSection(props: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  transfers: Array<PublicIdTransferRow>;
}) {
  const { locale, t } = useI18n();

  if (props.transfers.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ArrowsLeftRightIcon />
          </EmptyMedia>
          <EmptyTitle>{t("No permalink transfers yet")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{t("Permalink transfers")}</h3>
      <AdminTableCard
        canLoadMore={props.hasNextPage && !props.isFetchingNextPage}
        isLoadingMore={props.isFetchingNextPage}
        onLoadMore={props.onLoadMore}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("When")}</TableHead>
              <TableHead>{t("Current permalink")}</TableHead>
              <TableHead>{t("New permalink")}</TableHead>
              <TableHead>{t("Displaced to")}</TableHead>
              <TableHead>{t("Transferred by")}</TableHead>
              <TableHead>{t("Motivation")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.transfers.map((row) => (
              <TableRow key={row._id}>
                <TableCell>{formatWhen(row.createdAt, locale)}</TableCell>
                <TableCell className="font-medium">
                  <span className="inline-flex flex-col gap-0.5">
                    <span>{row.fromPublicId}</span>
                    <span className="font-normal text-muted-foreground">{row.babyName}</span>
                  </span>
                </TableCell>
                <TableCell className="font-medium">{row.toPublicId}</TableCell>
                <TableCell>{row.displacedPublicId ?? "—"}</TableCell>
                <TableCell>{row.actorEmail ?? row.actorUserId}</TableCell>
                <TableCell className="max-w-xs whitespace-normal">{row.motivation}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTableCard>
    </div>
  );
}

function InfiniteScrollSentinel(props: { canLoadMore: boolean; onLoadMore: () => void }) {
  const sentinelRef = useIntersectionAction({
    enabled: props.canLoadMore,
    onIntersect: props.onLoadMore,
    threshold: 0.1,
  });
  return <div aria-hidden="true" className="h-8 w-full" ref={sentinelRef} />;
}

function AdminTableCard(props: {
  canLoadMore: boolean;
  children: ReactNode;
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
  column: SortBy;
  hideDemo: boolean;
  label: string;
  order: SortOrder;
  sort: SortBy;
  tab: AdminTab;
}) {
  const active = props.column === props.sort;
  const next = nextSortSearch({
    clicked: props.column,
    currentOrder: props.order,
    currentSort: props.sort,
  });
  const SortIcon = active && props.order === "asc" ? CaretUpIcon : CaretDownIcon;

  return (
    <TableHead>
      <Link
        className={cn(
          "inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        replace
        resetScroll={false}
        search={{
          hideDemo: props.hideDemo,
          order: next.order,
          sort: next.sort,
          tab: props.tab,
        }}
        to="/dashboard/admin"
      >
        {props.label}
        <SortIcon
          aria-hidden="true"
          className={cn("opacity-0", active && "opacity-100")}
          data-icon="inline-end"
        />
      </Link>
    </TableHead>
  );
}

export function UsersSection(props: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  users: Array<UserRow>;
}) {
  const { locale, t } = useI18n();

  if (props.users.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>{t("No users yet")}</EmptyTitle>
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
            <TableHead>{t("Name")}</TableHead>
            <TableHead>{t("Email")}</TableHead>
            <TableHead>{t("Babies")}</TableHead>
            <TableHead>{t("Signed up")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.users.map((user) => (
            <TableRow key={user._id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell className="max-w-xs whitespace-normal">
                {user.babies.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  user.babies.map((baby, index) => (
                    <span key={baby.publicId}>
                      {index > 0 ? ", " : null}
                      <Link
                        className="underline-offset-4 hover:underline"
                        params={{ publicId: baby.publicId }}
                        to="/baby/$publicId"
                      >
                        {baby.name}
                      </Link>
                      {baby.demo ? ` (${t("Demo")})` : null}
                    </span>
                  ))
                )}
              </TableCell>
              <TableCell>{formatWhen(user.createdAt, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminTableCard>
  );
}

export function BabiesSection(props: {
  babies: Array<BabyRow>;
  hasNextPage: boolean;
  hideDemo: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  order: SortOrder;
  sort: SortBy;
  tab: AdminTab;
}) {
  const { locale, t } = useI18n();

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
              column="created"
              hideDemo={props.hideDemo}
              label={t("Created")}
              order={props.order}
              sort={props.sort}
              tab={props.tab}
            />
            <SortableHeaderLink
              column="updated"
              hideDemo={props.hideDemo}
              label={t("Updated")}
              order={props.order}
              sort={props.sort}
              tab={props.tab}
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
                <span className="inline-flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-2">
                    {baby.name}
                    {baby.demo ? <Badge variant="outline">{t("Demo")}</Badge> : null}
                  </span>
                  <span className="font-normal text-muted-foreground">{baby.publicId}</span>
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
                  nativeButton={false}
                  render={<Link params={{ publicId: baby.publicId }} to="/baby/$publicId" />}
                  size="sm"
                  variant="outline"
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
      hideDemo={search.hideDemo}
      isFetchingNextPage={babiesQuery.isFetchingNextPage}
      onLoadMore={() => {
        void babiesQuery.fetchNextPage();
      }}
      order={search.order}
      sort={search.sort}
      tab={search.tab}
    />
  );
}

function AdminTransfersTab() {
  const { t } = useI18n();
  const loaderData = Route.useLoaderData();
  const transferPublicId = useMutation(api.admin.transferPublicId);
  const transfersQuery = usePreloadedConvexInfiniteQuery(api.admin.listPublicIdTransfers, {
    handle: loaderData.transfers,
    remixArgs: null,
  });

  const transfers = transfersQuery.data.pages.flatMap((page) => page.page);

  return (
    <div className="flex flex-col gap-4">
      <TransferPublicIdForm
        onTransfer={async (values) => {
          await transferPublicId(values);
          toast.success(t("Permalink transferred"));
        }}
      />
      <PermalinkTransfersSection
        hasNextPage={transfersQuery.hasNextPage}
        isFetchingNextPage={transfersQuery.isFetchingNextPage}
        onLoadMore={() => {
          void transfersQuery.fetchNextPage();
        }}
        transfers={transfers}
      />
    </div>
  );
}

function AdminUsersTab() {
  const loaderData = Route.useLoaderData();
  const usersQuery = usePreloadedConvexInfiniteQuery(api.admin.listUsers, {
    handle: loaderData.users,
    remixArgs: null,
  });

  const users = usersQuery.data.pages.flatMap((page) => page.page);

  return (
    <UsersSection
      hasNextPage={usersQuery.hasNextPage}
      isFetchingNextPage={usersQuery.isFetchingNextPage}
      onLoadMore={() => {
        void usersQuery.fetchNextPage();
      }}
      users={users}
    />
  );
}

export function isAdminTab(value: string): value is AdminTab {
  return value === "babies" || value === "transfers" || value === "users";
}

export function AdminDashboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/admin" });

  return (
    <AdminDashboardView
      babiesTab={<AdminBabiesTab />}
      hideDemo={search.hideDemo}
      onHideDemoChange={(hideDemo) => {
        void navigate({
          replace: true,
          resetScroll: false,
          search: (prev) => ({ ...prev, hideDemo }),
        });
      }}
      onTabChange={(tab) => {
        void navigate({ replace: true, resetScroll: false, search: (prev) => ({ ...prev, tab }) });
      }}
      order={search.order}
      sort={search.sort}
      tab={search.tab}
      transfersTab={<AdminTransfersTab />}
      usersTab={<AdminUsersTab />}
    />
  );
}

/**
 * Admin chrome: tab links, the hide-demo filter, and whichever tab body is
 * active. Tab bodies arrive as nodes and URL state as plain props, so tests can
 * render it without the route's search params or Convex pagination.
 *
 * @internal Exported for tests; production uses `AdminDashboardPage`.
 */
export function AdminDashboardView(props: {
  babiesTab: ReactNode;
  hideDemo: boolean;
  onHideDemoChange: (hideDemo: boolean) => void;
  onTabChange: (tab: AdminTab) => void;
  order: SortOrder;
  sort: SortBy;
  tab: AdminTab;
  transfersTab: ReactNode;
  usersTab: ReactNode;
}) {
  const { t } = useI18n();

  const tabSearch = (tab: AdminTab): AdminSearch => ({
    hideDemo: props.hideDemo,
    order: props.order,
    sort: props.sort,
    tab,
  });

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
            <Tabs
              className="flex w-full flex-col gap-4"
              onValueChange={(value) => {
                if (isAdminTab(value)) {
                  props.onTabChange(value);
                }
              }}
              orientation="horizontal"
              value={props.tab}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList variant="default">
                  <TabsTrigger
                    nativeButton={false}
                    render={
                      <Link
                        replace
                        resetScroll={false}
                        search={tabSearch("babies")}
                        to="/dashboard/admin"
                      />
                    }
                    value="babies"
                  >
                    {t("All babies")}
                  </TabsTrigger>
                  <TabsTrigger
                    nativeButton={false}
                    render={
                      <Link
                        replace
                        resetScroll={false}
                        search={tabSearch("transfers")}
                        to="/dashboard/admin"
                      />
                    }
                    value="transfers"
                  >
                    {t("Transfer permalink")}
                  </TabsTrigger>
                  <TabsTrigger
                    nativeButton={false}
                    render={
                      <Link
                        replace
                        resetScroll={false}
                        search={tabSearch("users")}
                        to="/dashboard/admin"
                      />
                    }
                    value="users"
                  >
                    {t("Recent users")}
                  </TabsTrigger>
                </TabsList>

                {props.tab === "babies" ? (
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
                ) : null}
              </div>

              <TabsContent className="mt-0" value="babies">
                {props.tab === "babies" ? props.babiesTab : null}
              </TabsContent>

              <TabsContent className="mt-0" value="transfers">
                {props.tab === "transfers" ? props.transfersTab : null}
              </TabsContent>

              <TabsContent className="mt-0" value="users">
                {props.tab === "users" ? props.usersTab : null}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
