import { api } from "@workspace/convex/convex/_generated/api";
import type { Id } from "@workspace/convex/convex/_generated/dataModel";
import { FormControl, FormField, FormItem, FormMessage } from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { toast } from "sonner";
import { UserMinusIcon, UserPlusIcon, XIcon } from "@phosphor-icons/react";
import { z } from "zod";
import { FORBIDDEN } from "@workspace/convex/src/types";
import type { PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { Form, SubmitButton, useZodForm } from "@/components/Form";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

type CoParentsListing = Exclude<
  FunctionReturnType<typeof api.coParents.listForBaby>,
  typeof FORBIDDEN
>;

type InviteArgs = FunctionArgs<typeof api.coParents.invite>;

function inviteCoParentSchema(t: TranslationFunction, babyId: Id<"baby">) {
  return z
    .object({
      email: z
        .string()
        .trim()
        .check(z.email(t("Invalid email address"))),
    })
    .transform((values): InviteArgs => ({
      babyId,
      email: values.email,
    }));
}

function InviteCoParentForm(props: {
  babyId: Id<"baby">;
  onInvite: (args: InviteArgs) => Promise<{ status: "added" | "invited" }>;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: { email: "" },
    schema: inviteCoParentSchema(t, props.babyId),
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        const result = await props.onInvite(values);
        form.reset({ email: "" });
        toast.success(
          result.status === "added"
            ? t("Co-parent added — they can manage this page now")
            : t("Invite sent — they'll get access after signing up with that email"),
        );
      }}
    >
      <div className="flex gap-2">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input placeholder={t("partner@example.com")} type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton form="context" IconComponent={UserPlusIcon} iconPosition="start" size="sm">
          {t("Add")}
        </SubmitButton>
      </div>
    </Form>
  );
}

function RemoveCoParentForm(props: {
  coParentId: Id<"babyCoParents">;
  email: string;
  onRemove: (args: { coParentId: Id<"babyCoParents"> }) => Promise<void>;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {},
    schema: z.object({}),
  });

  return (
    <Form
      form={form}
      handleSubmit={async () => {
        await props.onRemove({ coParentId: props.coParentId });
        toast.success(t("Co-parent removed"));
      }}
    >
      <SubmitButton
        aria-label={t("Remove {{email}}", { email: props.email })}
        form="context"
        IconComponent={UserMinusIcon}
        iconPosition="start"
        size="icon-sm"
        variant="ghost"
      />
    </Form>
  );
}

function CancelInviteForm(props: {
  email: string;
  inviteId: Id<"babyCoParentInvites">;
  onCancel: (args: { inviteId: Id<"babyCoParentInvites"> }) => Promise<void>;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {},
    schema: z.object({}),
  });

  return (
    <Form
      form={form}
      handleSubmit={async () => {
        await props.onCancel({ inviteId: props.inviteId });
        toast.success(t("Invite cancelled"));
      }}
    >
      <SubmitButton
        aria-label={t("Cancel invite to {{email}}", { email: props.email })}
        form="context"
        IconComponent={XIcon}
        iconPosition="start"
        size="icon-sm"
        variant="ghost"
      />
    </Form>
  );
}

type CoParentsSettingsProps = {
  babyId: Id<"baby">;
  /** Only the owner can invite/remove; co-parents see a read-only list. */
  isOwner: boolean;
  listing: PreloadedConvexQuery<typeof api.coParents.listForBaby>;
};

/**
 * Settings section for inviting co-parents by email and managing membership.
 * Prefetched via the baby route loader when settings are open.
 */
export function CoParentsSettings(props: CoParentsSettingsProps) {
  const { t } = useI18n();
  const listingQuery = usePreloadedConvexQuery(api.coParents.listForBaby, props.listing);
  // FORBIDDEN only happens for non-managers, who never render this component —
  // treat it like an empty listing so the types stay honest.
  const listing: CoParentsListing =
    listingQuery.data === FORBIDDEN ? { coParents: [], invites: [] } : listingQuery.data;
  const invite = useMutation(api.coParents.invite);
  const removeCoParent = useMutation(api.coParents.removeCoParent);
  const cancelInvite = useMutation(api.coParents.cancelInvite);

  return (
    <div className="space-y-3 w-full">
      <ul className="space-y-2">
        {listing.coParents.map((row) => (
          <li className="flex items-center justify-between gap-2 text-sm" key={row._id}>
            <div className="min-w-0">
              <div className="font-medium truncate">{row.name || row.email}</div>
              {row.name ? <div className="text-muted-foreground truncate">{row.email}</div> : null}
            </div>
            {props.isOwner ? (
              <RemoveCoParentForm
                coParentId={row._id}
                email={row.email}
                onRemove={async (args) => {
                  await removeCoParent(args);
                }}
              />
            ) : null}
          </li>
        ))}
        {listing.invites.map((row) => (
          <li className="flex items-center justify-between gap-2 text-sm" key={row._id}>
            <div className="min-w-0">
              <div className="font-medium truncate">{row.email}</div>
              <div className="text-muted-foreground">{t("Invite pending")}</div>
            </div>
            {props.isOwner ? (
              <CancelInviteForm
                email={row.email}
                inviteId={row._id}
                onCancel={async (args) => {
                  await cancelInvite(args);
                }}
              />
            ) : null}
          </li>
        ))}
        {listing.coParents.length === 0 && listing.invites.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            {t("No co-parents yet. Add a partner so they can post updates too.")}
          </li>
        ) : null}
      </ul>

      {props.isOwner ? <InviteCoParentForm babyId={props.babyId} onInvite={invite} /> : null}
    </div>
  );
}
