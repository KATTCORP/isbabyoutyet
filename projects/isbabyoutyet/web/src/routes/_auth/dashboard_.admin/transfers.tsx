import { createFileRoute } from "@tanstack/react-router";
import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { z } from "zod";
import { convexPaginatedQuery } from "@workspace/convex-query";
import { ADMIN_PAGE_SIZE, AdminTableCard, formatWhen } from "@/components/admin/admin-table-card";
import { Form, SubmitButton, useZodForm } from "@/components/Form";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

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

export const Route = createFileRoute("/_auth/dashboard_/admin/transfers")({
  component: AdminTransfersPage,
  loader: async (opts) => {
    return await opts.context.queryClient.ensure(
      convexPaginatedQuery(api.admin.listPublicIdTransfers),
      { args: {}, numItems: ADMIN_PAGE_SIZE },
    );
  },
});

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

function AdminTransfersPage() {
  const { t } = useI18n();
  const transferPublicId = useMutation(api.admin.transferPublicId);
  const [transfersData, transfersQuery] = useQuery(
    convexPaginatedQuery(api.admin.listPublicIdTransfers),
    Route.useLoaderData(),
  );

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
        transfers={transfersData.pages.flatMap((page) => page.page)}
      />
    </div>
  );
}
