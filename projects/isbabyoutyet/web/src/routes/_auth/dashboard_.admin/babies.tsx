import { createFileRoute, Link } from "@tanstack/react-router";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { useQuery } from "@raf-query/react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { convexPaginatedQuery } from "@workspace/convex-query";
import { ADMIN_PAGE_SIZE, AdminTableCard, formatWhen } from "@/components/admin/admin-table-card";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import type { AdminBabiesSearch } from "@/routes/_auth/dashboard_.admin/route";

type SortBy = AdminBabiesSearch["sort"];
type SortOrder = AdminBabiesSearch["order"];

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

export const Route = createFileRoute("/_auth/dashboard_/admin/babies")({
  component: AdminBabiesPage,
  loaderDeps: (opts) => ({
    hideDemo: opts.search.hideDemo,
    order: opts.search.order,
    sort: opts.search.sort,
  }),
  loader: async (opts) => {
    // Paged queries stay blocking on the client too: the query cache makes
    // revisits free, and suspense churn on paginated tables isn't worth it.
    return await opts.context.queryClient.ensure(convexPaginatedQuery(api.admin.listBabies), {
      args: {
        hideDemo: opts.deps.hideDemo,
        sortBy: opts.deps.sort,
        sortOrder: opts.deps.order,
      },
      numItems: ADMIN_PAGE_SIZE,
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

function SortableHeaderLink(props: {
  column: SortBy;
  hideDemo: boolean;
  label: string;
  order: SortOrder;
  sort: SortBy;
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
        }}
        to="/dashboard/admin/babies"
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

export function BabiesSection(props: {
  babies: Array<BabyRow>;
  hasNextPage: boolean;
  hideDemo: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  order: SortOrder;
  sort: SortBy;
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
            />
            <SortableHeaderLink
              column="updated"
              hideDemo={props.hideDemo}
              label={t("Updated")}
              order={props.order}
              sort={props.sort}
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

function AdminBabiesPage() {
  const search = Route.useSearch();
  const [babiesData, babiesQuery] = useQuery(
    convexPaginatedQuery(api.admin.listBabies),
    Route.useLoaderData(),
    { throwOnError: true },
  );

  return (
    <BabiesSection
      babies={babiesData.pages.flatMap((page) => page.page)}
      hasNextPage={babiesQuery.hasNextPage}
      hideDemo={search.hideDemo}
      isFetchingNextPage={babiesQuery.isFetchingNextPage}
      onLoadMore={() => {
        void babiesQuery.fetchNextPage();
      }}
      order={search.order}
      sort={search.sort}
    />
  );
}
