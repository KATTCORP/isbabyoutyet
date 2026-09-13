import { Form, useZodForm } from "@/components/Form";
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
import { Button } from "@workspace/ui/components/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Switch } from "@workspace/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Clock, Trash } from "@phosphor-icons/react";
import type { FunctionArgs } from "convex/server";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import type { api } from "@baby-outlet/backend/convex/_generated/api";
import { getBlockingLaterMilestone, MILESTONE_LABELS } from "@baby-outlet/backend/src/types";
import type {
  BabyData,
  BabyUpdateHandler,
  Milestone,
  MilestoneRedateHandler,
  MilestoneRemoveHandler,
} from "@baby-outlet/backend/src/types";
import { htmlDate, htmlDateTime, htmlDateTimeNow } from "@/lib/html-date";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { getThemeOption, THEME_OPTIONS } from "./utils";

type BabyPatch = Omit<FunctionArgs<typeof api.baby.update>, "babyId">;

// The popover editors follow one pattern: the outer component owns the
// open state, the inner *Form component owns the form and is mounted fresh
// on every open — so defaultValues are always current and no reset is needed.

type EditorFormProps = {
  baby: BabyData;
  onUpdate: BabyUpdateHandler;
  onClose: () => void;
};

function EditorActions(props: { onClose: () => void; isSubmitting: boolean; isDirty: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2 justify-end">
      <Button
        type="button"
        onClick={props.onClose}
        variant="outline"
        size="sm"
        disabled={props.isSubmitting}
      >
        {t("Cancel")}
      </Button>
      <Button type="submit" size="sm" disabled={props.isSubmitting || !props.isDirty}>
        {t("Save")}
      </Button>
    </div>
  );
}

type DueDateEditorProps = {
  baby: BabyData;
  onUpdate: BabyUpdateHandler;
};

function dueDateSchema(t: TranslationFunction) {
  return z
    .object({
      date: htmlDate(t),
      showExactDueDate: z.boolean(),
      publicDueDateText: z.string().trim().max(80, t("Keep this under 80 characters")),
    })
    .superRefine((values, ctx) => {
      if (values.showExactDueDate && !values.date) {
        ctx.addIssue({
          code: "custom",
          path: ["date"],
          message: t("Pick a date"),
        });
      }
      if (!values.showExactDueDate && !values.publicDueDateText) {
        ctx.addIssue({
          code: "custom",
          path: ["publicDueDateText"],
          message: t("Enter a message for visitors"),
        });
      }
    })
    .transform(
      (values): Pick<BabyPatch, "dueDate" | "dueDateDisplayMode" | "publicDueDateText"> => ({
        dueDate: values.date,
        dueDateDisplayMode: values.showExactDueDate ? "exact" : "message",
        publicDueDateText: values.publicDueDateText || null,
      }),
    );
}

export function DueDateEditor(props: DueDateEditorProps) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open, eventDetails) => {
        // Keep the popover open while the native date picker (rendered outside
        // the popover) is in use; Base UI replaces onInteractOutside with
        // onOpenChange reasons + eventDetails.cancel()
        if (
          !open &&
          (eventDetails.reason === "outside-press" || eventDetails.reason === "focus-out")
        ) {
          const activeElement = document.activeElement;
          if (
            activeElement?.tagName === "INPUT" &&
            (activeElement as HTMLInputElement).type === "date"
          ) {
            eventDetails.cancel();
            return;
          }
        }
        setIsEditing(open);
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <DueDateForm
          baby={props.baby}
          onUpdate={props.onUpdate}
          onClose={() => setIsEditing(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function DueDateForm(props: EditorFormProps) {
  const { t } = useI18n();
  const dateCodec = htmlDate(t);
  const form = useZodForm({
    schema: dueDateSchema(t),
    defaultValues: {
      date: dateCodec.encode(props.baby.dueDate),
      showExactDueDate: props.baby.dueDateDisplayMode === "exact",
      publicDueDateText: props.baby.publicDueDateText ?? "",
    },
  });
  const showExactDueDate = useWatch({
    control: form.control,
    name: "showExactDueDate",
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onUpdate(values);
        props.onClose();
      }}
    >
      <FormField
        control={form.control}
        name="showExactDueDate"
        render={(renderProps) => (
          <FormItem className="mb-3 flex items-center justify-between gap-3 rounded-xl border p-3">
            <div className="flex flex-col gap-1">
              <FormLabel>{t("Show exact due date")}</FormLabel>
              <FormDescription>
                {renderProps.field.value
                  ? t("Visitors see the exact date and countdown.")
                  : t("Visitors see only your message.")}
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={renderProps.field.value}
                onCheckedChange={renderProps.field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
      {showExactDueDate ? (
        <FormField
          control={form.control}
          name="date"
          render={(renderProps) => (
            <FormItem className="mb-3">
              <FormControl>
                <Input
                  type="date"
                  aria-label={t("Due Date")}
                  onMouseDown={(event) => event.stopPropagation()}
                  onFocus={(event) => event.stopPropagation()}
                  {...renderProps.field}
                  value={renderProps.field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={form.control}
          name="publicDueDateText"
          render={(renderProps) => (
            <FormItem className="mb-3">
              <FormLabel>{t("Public due date message")}</FormLabel>
              <FormControl>
                <Input placeholder={t("September baby")} maxLength={80} {...renderProps.field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <EditorActions
        onClose={props.onClose}
        isSubmitting={form.formState.isSubmitting}
        isDirty={form.formState.isDirty}
      />
    </Form>
  );
}

type StatusDateEditorProps = {
  baby: BabyData;
  status: Milestone;
  currentDate: string;
  onRedate: MilestoneRedateHandler;
  onRemove: MilestoneRemoveHandler;
};

function statusDateSchema(t: TranslationFunction) {
  return z.object({ dateTime: htmlDateTime(t) });
}

export function StatusDateEditor(props: StatusDateEditorProps) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Popover open={isEditing} onOpenChange={setIsEditing}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Clock className="w-4 h-4 mr-2" />
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <StatusDateForm
          baby={props.baby}
          status={props.status}
          currentDate={props.currentDate}
          onRedate={props.onRedate}
          onRemove={props.onRemove}
          onClose={() => setIsEditing(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function StatusDateForm(props: {
  baby: BabyData;
  status: StatusDateEditorProps["status"];
  currentDate: string;
  onRedate: MilestoneRedateHandler;
  onRemove: MilestoneRemoveHandler;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [isDeleting, setIsDeleting] = useState(false);
  const dateTimeCodec = htmlDateTime(t);
  const form = useZodForm({
    schema: statusDateSchema(t),
    defaultValues: { dateTime: dateTimeCodec.encode(props.currentDate) },
  });
  const blocker = getBlockingLaterMilestone(props.baby, props.status);
  const statusLabel = MILESTONE_LABELS[props.status];

  const deleteButton = (
    <Button type="button" variant="destructive" size="sm" disabled={Boolean(blocker)}>
      <Trash data-icon="inline-start" />
      {t("Delete")}
    </Button>
  );

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onRedate(props.status, values.dateTime);
        props.onClose();
      }}
    >
      <FormField
        control={form.control}
        name="dateTime"
        render={({ field }) => (
          <FormItem className="mb-3">
            <FormControl>
              <Input
                type="datetime-local"
                aria-label={t("Status date and time")}
                max={htmlDateTimeNow()}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="flex items-center justify-between gap-2">
        {blocker ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="inline-flex"
                  aria-label={t("Delete the {{status}} status first", {
                    status: MILESTONE_LABELS[blocker],
                  })}
                />
              }
            >
              {deleteButton}
            </TooltipTrigger>
            <TooltipContent>
              {t("Delete the {{status}} status first", { status: MILESTONE_LABELS[blocker] })}
            </TooltipContent>
          </Tooltip>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger render={deleteButton} />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("Delete {{status}} status?", { status: statusLabel })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "This removes the status and deletes its timeline update, including any message or photo attached to it. This cannot be undone.",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      await props.onRemove(props.status);
                      props.onClose();
                    } catch {
                      toast.error(
                        t("Could not delete the {{status}} status", { status: statusLabel }),
                      );
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                >
                  {t("Delete status")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <EditorActions
          onClose={props.onClose}
          isSubmitting={form.formState.isSubmitting || isDeleting}
          isDirty={form.formState.isDirty}
        />
      </div>
    </Form>
  );
}

type NameEditorProps = {
  baby: BabyData;
  onUpdate: BabyUpdateHandler;
};

function nameSchema(t: TranslationFunction) {
  return z
    .object({
      name: z.string().trim().min(1, t("Name is required")),
    })
    .transform((values): Pick<BabyPatch, "name"> => values);
}

export function NameEditor(props: NameEditorProps) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Popover open={isEditing} onOpenChange={setIsEditing}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <NameForm baby={props.baby} onUpdate={props.onUpdate} onClose={() => setIsEditing(false)} />
      </PopoverContent>
    </Popover>
  );
}

function NameForm(props: EditorFormProps) {
  const { t } = useI18n();
  const form = useZodForm({
    schema: nameSchema(t),
    defaultValues: { name: props.baby.name },
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onUpdate(values);
        props.onClose();
      }}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem className="mb-3">
            <FormControl>
              <Input placeholder={t("Baby Name")} aria-label={t("Baby Name")} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <p className="text-xs text-muted-foreground mb-3">
        {t(
          "Renaming may change the page address, but links you have already shared will keep working.",
        )}
      </p>
      <EditorActions
        onClose={props.onClose}
        isSubmitting={form.formState.isSubmitting}
        isDirty={form.formState.isDirty}
      />
    </Form>
  );
}

type ThemeSelectorProps = {
  baby: BabyData;
  onUpdate: BabyUpdateHandler;
};

export function ThemeSelector(props: ThemeSelectorProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const selectedTheme = getThemeOption(props.baby.theme);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            {t("Change")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56">
        <div className="flex flex-col gap-1">
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option.value ?? "default"}
              variant={selectedTheme?.value === option.value ? "default" : "ghost"}
              aria-pressed={selectedTheme?.value === option.value}
              size="sm"
              className="justify-start gap-2"
              disabled={isLoading}
              onClick={async () => {
                setIsLoading(true);
                try {
                  await props.onUpdate({ theme: option.value });
                  setIsOpen(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : t("Failed to update theme"));
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              <div className="flex gap-0.5">
                {option.colors.map((color, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-sm border border-border/50"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              {t(option.labelKey)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
