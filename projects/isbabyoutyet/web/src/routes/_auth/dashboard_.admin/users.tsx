import { createFileRoute, Link } from "@tanstack/react-router";
import { UsersIcon } from "@phosphor-icons/react";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { useQuery } from "@raf-query/react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@workspace/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { convexPaginatedQuery } from "@workspace/convex-query";
import { ADMIN_PAGE_SIZE, AdminTableCard, formatWhen } from "@/components/admin/admin-table-card";
import { useI18n } from "@/lib/i18n";

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

export const Route = createFileRoute("/_auth/dashboard_/admin/users")({
  component: AdminUsersPage,
  loader: async (opts) => {
    return await opts.context.queryClient.ensure(convexPaginatedQuery(api.admin.listUsers), {
      args: {},
      numItems: ADMIN_PAGE_SIZE,
    });
  },
});

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

function AdminUsersPage() {
  const [usersData, usersQuery] = useQuery(
    convexPaginatedQuery(api.admin.listUsers),
    Route.useLoaderData(),
  );

  return (
    <UsersSection
      hasNextPage={usersQuery.hasNextPage}
      isFetchingNextPage={usersQuery.isFetchingNextPage}
      onLoadMore={() => {
        void usersQuery.fetchNextPage();
      }}
      users={usersData.pages.flatMap((page) => page.page)}
    />
  );
}
