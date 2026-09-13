import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent, DialogTrigger } from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useMutation } from "convex/react";
import {
  Camera,
  ChatCircleText,
  Check,
  Confetti,
  Heart,
  Heartbeat,
  Hospital,
  Images,
  PaperPlaneTilt,
  PencilSimple,
  PushPin,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import * as z from "zod";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import type {
  InitiatedConvexInfiniteQuery,
  PreloadedConvexInfiniteQuery,
} from "@workspace/convex-prefetch";
import type { BabyData, Milestone } from "@baby-outlet/backend/src/types";
import {
  getBlockingLaterMilestone,
  getMilestonePolicy,
  MILESTONE_LABELS,
} from "@baby-outlet/backend/src/types";
import { Form, useZodForm } from "@/components/Form";
import { FormControl, FormField, FormItem, FormMessage } from "@workspace/ui/components/form";
import { htmlDateTimeNow, optionalHtmlDateTime } from "@/lib/html-date";
import { usePreloadedConvexInfiniteQuery } from "@workspace/convex-prefetch";
import { getVisitorId } from "./encouragements";
import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import type { TranslationFunction, TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { BlurImage } from "@/components/blur-image";
import { MILESTONE_LABEL_KEYS } from "./translation-keys";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

type TimelineItemData = FunctionReturnType<typeof api.timeline.listByBaby>["page"][number];
type UpdateItemData = Extract<TimelineItemData, { kind: "update" }>;
type EncouragementItemData = Extract<TimelineItemData, { kind: "encouragement" }>;

const MAX_UPDATE_MESSAGE_LENGTH = 1000;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function usePhotoPreviewUrl(photo: File | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(photo);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [photo]);

  return url;
}

/**
 * A post's three fields are mutually inclusive: any combination works, as
 * long as at least one is present. The message is trimmed BEFORE validation,
 * so a whitespace-only message counts as no message (matching the backend).
 * `occurredAt` starts empty (= "now"); a filled value backdates the milestone.
 */
type PostUpdateArgs = FunctionArgs<typeof api.updates.post>;

function composerSchema(opts: {
  t: TranslationFunction;
  allowedMilestones: readonly Milestone[];
  babyId: Id<"baby">;
}) {
  return z
    .object({
      message: z.string().trim().max(MAX_UPDATE_MESSAGE_LENGTH),
      milestone: z.union([
        z.literal("none"),
        z.literal("labor_started"),
        z.literal("gone_to_hospital"),
        z.literal("born"),
      ]),
      occurredAt: optionalHtmlDateTime(opts.t),
      photo: z.custom<File>().nullable(),
    })
    .refine(
      (draft) => draft.message.length > 0 || draft.milestone !== "none" || draft.photo != null,
      { error: opts.t("Add a message, a photo, or a milestone to post") },
    )
    .refine(
      (draft) => draft.milestone === "none" || opts.allowedMilestones.includes(draft.milestone),
      {
        error: opts.t("That status has already been marked"),
        path: ["milestone"],
      },
    )
    .transform((draft): PostUpdateArgs & { photo: File | null } => {
      const milestone = draft.milestone === "none" ? undefined : draft.milestone;
      return {
        babyId: opts.babyId,
        message: draft.message || undefined,
        milestone,
        occurredAt: milestone ? (draft.occurredAt ?? undefined) : undefined,
        photo: draft.photo,
      };
    });
}

const MILESTONE_META = {
  labor_started: { labelKey: MILESTONE_LABEL_KEYS.labor_started, icon: Heartbeat },
  gone_to_hospital: { labelKey: MILESTONE_LABEL_KEYS.gone_to_hospital, icon: Hospital },
  born: { labelKey: MILESTONE_LABEL_KEYS.born, icon: Confetti },
} as const satisfies Record<Milestone, { labelKey: TranslationKey; icon: typeof Heartbeat }>;

function getRelativeTimeFromTimestamp(timestamp: number, locale: SupportedLocale): string {
  const now = Date.now();
  const diffInSeconds = Math.floor((timestamp - now) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const intervals = [
    { unit: "year" as const, seconds: 31536000 },
    { unit: "month" as const, seconds: 2592000 },
    { unit: "week" as const, seconds: 604800 },
    { unit: "day" as const, seconds: 86400 },
    { unit: "hour" as const, seconds: 3600 },
    { unit: "minute" as const, seconds: 60 },
  ];

  for (const { unit, seconds } of intervals) {
    const interval = Math.floor(Math.abs(diffInSeconds) / seconds);
    if (interval >= 1) {
      return rtf.format(diffInSeconds > 0 ? interval : -interval, unit);
    }
  }

  return rtf.format(0, "second");
}

/** Milestone event clock in the viewer's local timezone (e.g. "Jan 11, 5:14 AM"). */
function formatOccurredAtLocal(timestamp: number, locale: SupportedLocale): string {
  return new Date(timestamp).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isWithinEditWindow(createdAt: number): boolean {
  return Date.now() - createdAt < EDIT_WINDOW_MS;
}

// --- Owner composer ---

type UpdateComposerProps = {
  babyId: Id<"baby">;
  baby: BabyData;
  babyName: string;
  /** Called after a successful post (e.g. to close the containing dialog) */
  onPosted: () => void;
};

export function UpdateComposer(props: UpdateComposerProps) {
  const { t } = useI18n();
  const postUpdate = useMutation(api.updates.post);
  const generateUploadUrl = useMutation(api.baby.generateUploadUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The status only moves forward: offer only stages AFTER the current one,
  // and none at all once "Born" is reached
  const milestonePolicy = getMilestonePolicy(props.baby);
  const currentStatus = milestonePolicy.currentStatus;
  const futureMilestones = milestonePolicy.visibleMilestones.filter(milestonePolicy.canMark);
  const schema = composerSchema({
    t,
    allowedMilestones: futureMilestones,
    babyId: props.babyId,
  });

  const form = useZodForm({
    schema,
    // RHF re-runs the resolver when this changes (status advanced in another tab)
    context: currentStatus.type,
    defaultValues: {
      message: "",
      milestone: "none",
      // Empty means "happening now"; fill in to backdate
      occurredAt: "",
      photo: null,
    },
  });
  const isPosting = form.formState.isSubmitting;

  const draft = form.watch();

  // Guard against a stale selection: the status may have advanced from
  // another tab while a milestone was selected here. The mask keeps the
  // current render correct; the effect clears the value so the old choice
  // can't resurface if the status regresses later via unmarking.
  const selectedMilestone =
    draft.milestone !== "none" && futureMilestones.includes(draft.milestone)
      ? draft.milestone
      : null;
  useEffect(() => {
    const value = form.getValues("milestone");
    if (value !== "none" && !futureMilestones.includes(value)) {
      form.setValue("milestone", "none");
      form.resetField("occurredAt");
    }
  }, [form, currentStatus.type, milestonePolicy.visibility]);

  const photoPreviewUrl = usePhotoPreviewUrl(draft.photo);

  const canPost = !isPosting && schema.safeParse(draft).success;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ChatCircleText className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">{t("Post an update")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          "Everyone following {{name}}'s page will see it. A message, a photo, a milestone — each is optional, any mix works.",
          { name: props.babyName },
        )}
      </p>

      <Form
        form={form}
        handleSubmit={async (values) => {
          const { photo, ...args } = values;
          let photoId: PostUpdateArgs["photoId"];
          if (photo) {
            const uploadUrl = await generateUploadUrl({ babyId: args.babyId });
            const response = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": photo.type },
              body: photo,
            });
            if (!response.ok) {
              throw new Error(t("Failed to upload photo"));
            }
            const uploaded = (await response.json()) as { storageId: Id<"_storage"> };
            photoId = uploaded.storageId;
          }

          await postUpdate({ ...args, photoId });

          toast.success(t("Update posted!"));
          // No reset needed: the composer lives in a dialog that unmounts on close
          props.onPosted();
        }}
      >
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder={t("Write a message (optional)…")}
                    aria-label={t("Update message (optional)")}
                    className="min-h-20"
                    maxLength={MAX_UPDATE_MESSAGE_LENGTH}
                    disabled={isPosting}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {photoPreviewUrl && (
            <div className="relative w-fit">
              <img
                src={photoPreviewUrl}
                alt={t("Photo to post")}
                className="max-h-40 rounded-lg border border-border object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow"
                onClick={() => {
                  form.setValue("photo", null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={isPosting}
                aria-label={t("Remove photo")}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          {futureMilestones.length > 0 && (
            <div className="space-y-2">
              <p id="composer-status-label" className="text-xs font-medium text-muted-foreground">
                {t("Status change (optional)")}
              </p>
              <FormField
                control={form.control}
                name="milestone"
                render={(renderProps) => (
                  <RadioGroup
                    aria-labelledby="composer-status-label"
                    value={selectedMilestone ?? "none"}
                    onValueChange={(value) => {
                      renderProps.field.onChange(value);
                      // Deselecting forgets any backdate; reselecting starts from "now"
                      if (value === "none") form.resetField("occurredAt");
                    }}
                    disabled={isPosting}
                    className="gap-1.5"
                  >
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="none" />
                      {t("No status change")}
                    </label>
                    {futureMilestones.map((candidate) => {
                      const meta = MILESTONE_META[candidate];
                      const MilestoneIcon = meta.icon;
                      return (
                        <label
                          key={candidate}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <RadioGroupItem value={candidate} />
                          <MilestoneIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          {t(meta.labelKey)}
                        </label>
                      );
                    })}
                  </RadioGroup>
                )}
              />
              {selectedMilestone && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'This changes the page status to "{{status}}" and notifies everyone subscribed.',
                      {
                        status: t(MILESTONE_META[selectedMilestone].labelKey),
                      },
                    )}
                  </p>
                  <FormField
                    control={form.control}
                    name="occurredAt"
                    render={({ field }) => (
                      <FormItem>
                        <label className="block space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {t("When did it happen? (optional)")}
                          </span>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              max={htmlDateTimeNow()}
                              disabled={isPosting}
                              className="w-fit"
                              {...field}
                            />
                          </FormControl>
                        </label>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Optional — leave blank for now. You can change the time later in settings.",
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!file.type.startsWith("image/")) {
                toast.error(t("Please select an image file"));
                return;
              }
              if (file.size > MAX_PHOTO_SIZE_BYTES) {
                toast.error(t("Photo must be 10 MB or smaller"));
                return;
              }
              form.setValue("photo", file, { shouldDirty: true });
            }}
            className="hidden"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPosting}
            >
              <Images className="w-4 h-4" />
              {draft.photo ? t("Change photo") : t("Add photo (optional)")}
            </Button>
            <Button type="submit" disabled={!canPost}>
              <PaperPlaneTilt className="w-4 h-4" />
              {isPosting
                ? t("Posting...")
                : selectedMilestone
                  ? t('Post & mark "{{status}}"', {
                      status: t(MILESTONE_META[selectedMilestone].labelKey),
                    })
                  : t("Post update")}
            </Button>
          </div>

          {!canPost && !isPosting && (
            <p className="text-xs text-muted-foreground text-right">
              {t("Add a message, a photo, or a milestone — any one is enough.")}
            </p>
          )}
        </div>
      </Form>
    </div>
  );
}

// --- Timeline items ---

type UpdateTimelineItemProps = {
  item: UpdateItemData;
  baby: BabyData;
  babyName: string;
  isOwner: boolean;
  onDelete: (updateId: Id<"updates">) => Promise<void>;
  onSetAsCurrentPhoto: (updateId: Id<"updates">) => Promise<void>;
};

const MILESTONE_EMOJI: Record<Milestone, string> = {
  labor_started: "💫",
  gone_to_hospital: "🏥",
  born: "🎉",
};

function UpdateTimelineItem(props: UpdateTimelineItemProps) {
  const { locale, t } = useI18n();
  const update = props.item.update;
  const milestoneMeta = update.milestone ? MILESTONE_META[update.milestone] : null;
  const MilestoneIcon = milestoneMeta?.icon ?? Camera;
  const bubbleEmoji = update.milestone
    ? MILESTONE_EMOJI[update.milestone]
    : update.photoUrl
      ? "📸"
      : "💬";
  const canPinPhoto = props.isOwner && !!update.photoUrl && !update.isCurrentPagePhoto;
  const deleteBlocker = update.milestone
    ? getBlockingLaterMilestone(props.baby, update.milestone)
    : null;

  const deleteButton = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={t("Delete update")}
      disabled={Boolean(deleteBlocker)}
    >
      <Trash className="w-4 h-4 text-muted-foreground hover:text-destructive" />
    </Button>
  );

  return (
    <div className="group flex items-start gap-3">
      <span
        className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/25 bg-primary/10 text-lg"
        aria-hidden="true"
      >
        {bubbleEmoji}
      </span>
      <div className="min-w-0 flex-1 rounded-3xl rounded-tl-lg border-2 border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="font-medium text-foreground truncate">
              {t("{{name}}'s family", { name: props.babyName })}
            </span>
            {milestoneMeta ? (
              <Badge
                className="shrink-0"
                title={
                  update.occurredAt ? formatOccurredAtLocal(update.occurredAt, locale) : undefined
                }
              >
                <MilestoneIcon className="w-3 h-3" />
                {update.milestone && t(MILESTONE_LABEL_KEYS[update.milestone])}
                {update.occurredAt != null && (
                  <span className="font-normal opacity-90">
                    · {formatOccurredAtLocal(update.occurredAt, locale)}
                  </span>
                )}
              </Badge>
            ) : update.photoUrl ? (
              <Badge variant="secondary" className="shrink-0">
                <Camera className="w-3 h-3" />
                {t("New photo")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                {t("Update")}
              </Badge>
            )}
            {update.isCurrentPagePhoto && (
              <Badge variant="outline" className="shrink-0">
                <PushPin className="w-3 h-3" />
                {t("Page photo")}
              </Badge>
            )}
            <span
              className="text-xs text-muted-foreground shrink-0"
              title={t("Posted {{date}}", {
                date: new Date(props.item.postedAt).toLocaleString(locale),
              })}
            >
              {getRelativeTimeFromTimestamp(props.item.postedAt, locale)}
            </span>
          </div>

          {props.isOwner && (
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity shrink-0">
              {canPinPhoto && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t("Set as page photo")}
                  title={t("Set as page photo")}
                  onClick={() => props.onSetAsCurrentPhoto(update._id)}
                >
                  <PushPin className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </Button>
              )}
              {deleteBlocker ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className="inline-flex"
                        aria-label={t("Delete the {{status}} status first", {
                          status: MILESTONE_LABELS[deleteBlocker],
                        })}
                      />
                    }
                  >
                    {deleteButton}
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("Delete the {{status}} status first", {
                      status: MILESTONE_LABELS[deleteBlocker],
                    })}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger render={deleteButton} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("Delete update?")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {update.milestone
                          ? t("This also unmarks the milestone on the status card.")
                          : t("This removes the update from the timeline.")}{" "}
                        {update.photoUrl
                          ? t(
                              "If this photo is the current page photo, the previous one takes its place.",
                            )
                          : ""}{" "}
                        {t("This action cannot be undone.")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => props.onDelete(update._id)}
                      >
                        {t("Delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>

        {/* Photo first when present; the caption/message sits last so long
            copy doesn't push the image below the fold of the card. */}
        {update.photoUrl && (
          <TimelinePhoto
            photoUrl={update.photoUrl}
            thumbnailUrl={update.thumbnailUrl}
            blurDataUrl={update.blurDataUrl}
          />
        )}

        {update.message && (
          <div className="mt-2 min-w-0 max-w-none break-words text-sm text-foreground/90 prose prose-sm [overflow-wrap:anywhere] dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-a:text-primary [&_code]:whitespace-pre-wrap [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
            <Streamdown>{update.message}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
}

type TimelinePhotoProps = {
  photoUrl: string;
  thumbnailUrl: string | null;
  blurDataUrl: string | null;
};

function TimelinePhoto(props: TimelinePhotoProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const inlineUrl = props.thumbnailUrl ?? props.photoUrl;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <button
            aria-label={t("View photo full size")}
            className="mt-2 block w-full max-w-full cursor-pointer overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <BlurImage
              src={inlineUrl}
              alt={t("Baby update")}
              blurDataUrl={props.blurDataUrl}
              className="aspect-square max-h-64 w-full object-cover"
              loading="lazy"
            />
          </button>
        }
      />
      <DialogContent className="max-w-3xl p-0 border-0 bg-transparent shadow-none">
        <button
          onClick={() => setIsOpen(false)}
          aria-label={t("Close photo")}
          className="absolute -top-12 right-0 p-2 rounded-full bg-background/80 backdrop-blur-sm text-foreground hover:bg-background transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <BlurImage
          src={props.photoUrl}
          alt={t("Baby update")}
          blurDataUrl={props.blurDataUrl}
          className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
        />
      </DialogContent>
    </Dialog>
  );
}

type EncouragementTimelineItemProps = {
  item: EncouragementItemData;
  isOwner: boolean;
  currentVisitorId: string;
  onDelete: (id: Id<"encouragements">, visitorId: string | undefined) => Promise<void>;
  onUpdate: (args: FunctionArgs<typeof api.encouragements.update>) => Promise<void>;
};

function encouragementEditSchema(
  t: TranslationFunction,
  args: Pick<FunctionArgs<typeof api.encouragements.update>, "encouragementId" | "visitorId">,
) {
  return z
    .object({
      message: z.string().trim().min(1, t("Message cannot be empty")),
    })
    .transform((values): FunctionArgs<typeof api.encouragements.update> => ({
      ...args,
      message: values.message,
    }));
}
/**
 * Mounted only while editing, so the form initializes from the current
 * message on every reveal — no reset bookkeeping.
 */
function EncouragementEditForm(props: {
  initialMessage: string;
  encouragementId: Id<"encouragements">;
  visitorId: string;
  onSave: (args: FunctionArgs<typeof api.encouragements.update>) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    schema: encouragementEditSchema(t, {
      encouragementId: props.encouragementId,
      visitorId: props.visitorId,
    }),
    defaultValues: { message: props.initialMessage },
  });
  const isSaving = form.formState.isSubmitting;

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onSave(values);
      }}
    >
      <div className="space-y-2">
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  aria-label={t("Edit your message")}
                  className="min-h-20"
                  disabled={isSaving}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={isSaving}>
            <Check className="w-3 h-3" />
            {isSaving ? t("Saving...") : t("Save")}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={props.onCancel}
            disabled={isSaving}
          >
            <X className="w-3 h-3" />
            {t("Cancel")}
          </Button>
        </div>
      </div>
    </Form>
  );
}

function EncouragementTimelineItem(props: EncouragementTimelineItemProps) {
  const { locale, t } = useI18n();
  const encouragement = props.item.encouragement;
  const [isEditing, setIsEditing] = useState(false);

  const isOwnPost = encouragement.isMine;
  const canEdit = isOwnPost && isWithinEditWindow(encouragement.createdAt);
  const canDelete = props.isOwner || canEdit;
  const initial = encouragement.authorName.trim().charAt(0).toUpperCase() || "💛";

  return (
    <div className="group flex items-start gap-3">
      <span
        className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-secondary/40 text-base font-black text-secondary-foreground"
        aria-hidden="true"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1 rounded-3xl rounded-tl-lg border-2 border-border/70 bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground truncate">
                {encouragement.authorName}
              </span>
              <span
                className="text-xs text-muted-foreground shrink-0"
                title={new Date(encouragement.createdAt).toLocaleString(locale)}
              >
                {getRelativeTimeFromTimestamp(encouragement.createdAt, locale)}
              </span>
              {isOwnPost && <span className="text-xs text-primary/70 shrink-0">{t("(you)")}</span>}
            </div>

            {isEditing ? (
              <EncouragementEditForm
                initialMessage={encouragement.message}
                encouragementId={encouragement._id}
                visitorId={props.currentVisitorId}
                onSave={async (args) => {
                  await props.onUpdate(args);
                  setIsEditing(false);
                }}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <div className="min-w-0 max-w-none break-words text-sm text-muted-foreground prose prose-sm [overflow-wrap:anywhere] dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-a:text-primary [&_code]:whitespace-pre-wrap [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
                <Streamdown>{encouragement.message}</Streamdown>
              </div>
            )}
          </div>

          {!isEditing && (canEdit || canDelete) && (
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity shrink-0">
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t("Edit encouragement")}
                  onClick={() => setIsEditing(true)}
                >
                  <PencilSimple className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </Button>
              )}
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t("Delete encouragement")}
                      >
                        <Trash className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("Delete Encouragement?")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          "Are you sure you want to delete this encouragement from {{name}}? This action cannot be undone.",
                          { name: encouragement.authorName },
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          props.onDelete(
                            encouragement._id,
                            canEdit ? props.currentVisitorId : undefined,
                          )
                        }
                      >
                        {t("Delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Feed ---

type TimelineFeedProps = {
  babyId: Id<"baby">;
  baby: BabyData;
  babyName: string;
  isOwner: boolean;
  /** Prefetched infinite timeline handle from the route loader (SSR first page). */
  timeline:
    | PreloadedConvexInfiniteQuery<typeof api.timeline.listByBaby>
    | InitiatedConvexInfiniteQuery<typeof api.timeline.listByBaby>;
};

export function TimelineFeed(props: TimelineFeedProps) {
  const { t } = useI18n();
  const [currentVisitorId, setCurrentVisitorId] = useState("");
  // visitorId only marks the caller's own encouragements (isMine); the
  // credential itself is never returned by the query. Remix after mount so
  // the first render matches the SSR handle (no visitorId).
  const timelineQuery = usePreloadedConvexInfiniteQuery(api.timeline.listByBaby, {
    handle: props.timeline,
    remixArgs: (args) => ({
      ...args,
      ...(currentVisitorId ? { visitorId: currentVisitorId } : {}),
    }),
  });
  const removeUpdate = useMutation(api.updates.remove);
  const setAsCurrentPhoto = useMutation(api.updates.setAsCurrentPhoto);
  const removeEncouragement = useMutation(api.encouragements.remove);
  const updateEncouragement = useMutation(api.encouragements.update);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const items = timelineQuery.data.pages.flatMap((page) => page.page);

  // Get visitor ID on client side
  useEffect(() => {
    setCurrentVisitorId(getVisitorId());
  }, []);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!timelineQuery.hasNextPage || timelineQuery.isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void timelineQuery.fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [timelineQuery.hasNextPage, timelineQuery.isFetchingNextPage, timelineQuery.fetchNextPage]);

  const handleDeleteUpdate = async (updateId: Id<"updates">) => {
    try {
      await removeUpdate({ updateId });
      toast.success(t("Update removed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to remove update"));
    }
  };

  const handleSetAsCurrentPhoto = async (updateId: Id<"updates">) => {
    try {
      await setAsCurrentPhoto({ updateId });
      toast.success(t("Set as the page photo"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to set page photo"));
    }
  };

  const handleDeleteEncouragement = async (
    encouragementId: Id<"encouragements">,
    visitorId: string | undefined,
  ) => {
    try {
      await removeEncouragement({ encouragementId, visitorId });
      toast.success(t("Encouragement removed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to remove encouragement"));
    }
  };

  const handleUpdateEncouragement = async (
    args: FunctionArgs<typeof api.encouragements.update>,
  ) => {
    try {
      await updateEncouragement(args);
      toast.success(t("Encouragement updated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to update encouragement"));
      throw error;
    }
  };

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-extrabold text-foreground">
            {t("Updates & encouragements")}
          </h3>
        </div>
        <div className="rounded-3xl border-2 border-dashed border-border py-10 text-center">
          <p className="text-3xl" aria-hidden="true">
            💌
          </p>
          <p className="mt-3 font-bold text-foreground">{t("Nothing here yet")}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {props.isOwner
              ? t("Post your first update to keep everyone in the loop!")
              : t("Updates from the family will show up here.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-extrabold text-foreground">{t("Updates & encouragements")}</h3>
      </div>

      <div className="space-y-4">
        {items.map((item) =>
          item.kind === "update" ? (
            <UpdateTimelineItem
              key={item._id}
              item={item}
              baby={props.baby}
              babyName={props.babyName}
              isOwner={props.isOwner}
              onDelete={handleDeleteUpdate}
              onSetAsCurrentPhoto={handleSetAsCurrentPhoto}
            />
          ) : (
            <EncouragementTimelineItem
              key={item._id}
              item={item}
              isOwner={props.isOwner}
              currentVisitorId={currentVisitorId}
              onDelete={handleDeleteEncouragement}
              onUpdate={handleUpdateEncouragement}
            />
          ),
        )}

        {/* Infinite scroll trigger */}
        <div ref={loadMoreRef} className="py-2">
          {timelineQuery.isFetchingNextPage ? (
            <div className="text-center text-muted-foreground">
              <Spinner className="mx-auto" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
