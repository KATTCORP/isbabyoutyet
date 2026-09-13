import {
  Form,
  FormCancelButton,
  FormGuardProvider,
  shouldBlockOverlayDismiss,
  SubmitButton,
  useFormGuard,
  useZodForm,
} from "@/components/Form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { FormControl, FormField, FormItem, FormMessage } from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { DueDateDisplayFields } from "@/components/baby/dueDateDisplayFields";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { CheckIcon, ClockIcon, TrashIcon } from "@phosphor-icons/react";
import type { FunctionArgs } from "convex/server";
import { useFormState, useWatch } from "react-hook-form";
import { z } from "zod";
import type { api } from "@isbabyoutyet/backend/convex/_generated/api";
import {
  BIRTH_JOURNEYS,
  getBlockingLaterMilestone,
  MILESTONE_LABELS,
} from "@isbabyoutyet/backend/src/types";
import type {
  BabyData,
  BabyUpdateHandler,
  BirthJourney,
  Milestone,
  MilestoneRedateHandler,
  MilestoneRemoveHandler,
} from "@isbabyoutyet/backend/src/types";
import { JourneyMilestoneEditor } from "./journey-milestone-editor";
import { htmlDate, htmlDateTime, htmlDateTimeNow } from "@/lib/html-date";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { getThemeOption, THEME_OPTIONS } from "./utils";

type BabyPatch = FunctionArgs<typeof api.baby.update>["patch"];

const emptyActionSchema = z.object({});

// Uncontrolled popovers: forms mount fresh when the popup opens so
// defaultValues stay current without a reset. Cancel uses PopoverClose +
// FormCancelButton; successful save/delete closes via useFormGuard.close.

type EditorFormProps = {
  baby: BabyData;
  onClose: () => void;
  onUpdate: BabyUpdateHandler;
};

function EditorActions(props: { isBusy: boolean }) {
  const { t } = useI18n();
  // Subscribe via useFormState — reading form.formState via the Proxy is not a
  // reliable re-render under the React Compiler. FormCancelButton owns
  // isSubmitting for Cancel; keep isDirty / isBusy for Save.
  const { isDirty } = useFormState();
  return (
    <div className="flex gap-2 justify-end">
      <PopoverClose render={<FormCancelButton disabled={props.isBusy} form="context" size="sm" />}>
        {t("Cancel")}
      </PopoverClose>
      <SubmitButton
        disabled={!isDirty || props.isBusy}
        form="context"
        IconComponent={CheckIcon}
        iconPosition="start"
        size="sm"
      >
        {t("Save")}
      </SubmitButton>
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
      publicDueDateText: z.string().trim().max(80, t("Keep this under 80 characters")),
      showExactDueDate: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (values.showExactDueDate && !values.date) {
        ctx.addIssue({
          code: "custom",
          message: t("Pick a date"),
          path: ["date"],
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
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <FormGuardProvider guard={overlay}>
          <DueDateForm baby={props.baby} onClose={overlay.close} onUpdate={props.onUpdate} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function DueDateForm(props: EditorFormProps) {
  const { t } = useI18n();
  const dateCodec = htmlDate(t);
  const form = useZodForm({
    defaultValues: {
      date: dateCodec.encode(props.baby.dueDate),
      publicDueDateText: props.baby.publicDueDateText ?? "",
      showExactDueDate: props.baby.dueDateDisplayMode === "exact",
    },
    schema: dueDateSchema(t),
  });
  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onUpdate(values);
        props.onClose();
      }}
    >
      <DueDateDisplayFields
        className="mb-3"
        control={form.control}
        dateFieldName="date"
        publicDueDateTextFieldName="publicDueDateText"
        sectionLabelClassName={undefined}
        showExactDueDateFieldName="showExactDueDate"
        stopPopoverPropagation={true}
      />
      <EditorActions isBusy={false} />
    </Form>
  );
}

type StatusDateEditorProps = {
  baby: BabyData;
  currentDate: string;
  onRedate: MilestoneRedateHandler;
  onRemove: MilestoneRemoveHandler;
  status: Milestone;
};

function statusDateSchema(t: TranslationFunction, timeZone: string) {
  return z.object({ dateTime: htmlDateTime(t, timeZone) });
}

export function StatusDateEditor(props: StatusDateEditorProps) {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline">
            <ClockIcon className="w-4 h-4 mr-2" />
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <FormGuardProvider guard={overlay}>
          <StatusDateForm
            baby={props.baby}
            currentDate={props.currentDate}
            onClose={overlay.close}
            onRedate={props.onRedate}
            onRemove={props.onRemove}
            status={props.status}
          />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function StatusDateForm(props: {
  baby: BabyData;
  currentDate: string;
  onClose: () => void;
  onRedate: MilestoneRedateHandler;
  onRemove: MilestoneRemoveHandler;
  status: StatusDateEditorProps["status"];
}) {
  const { t } = useI18n();
  const dateTimeCodec = htmlDateTime(t, props.baby.timeZone);
  const form = useZodForm({
    defaultValues: { dateTime: dateTimeCodec.encode(props.currentDate) },
    schema: statusDateSchema(t, props.baby.timeZone),
  });
  const deleteForm = useZodForm({
    defaultValues: {},
    schema: emptyActionSchema,
  });
  const { isSubmitting: isDeleting } = useFormState({ control: deleteForm.control });
  const blocker = getBlockingLaterMilestone(props.baby, props.status);
  const statusLabel = MILESTONE_LABELS[props.status];

  const deleteButton = (
    <Button disabled={Boolean(blocker)} size="sm" type="button" variant="destructive">
      <TrashIcon data-icon="inline-start" />
      {t("Delete")}
    </Button>
  );

  return (
    <>
      <Form
        form={deleteForm}
        handleSubmit={async () => {
          await props.onRemove(props.status);
          props.onClose();
        }}
      >
        {null}
      </Form>
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
                  aria-label={t("Status date and time")}
                  max={htmlDateTimeNow(props.baby.timeZone)}
                  type="datetime-local"
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
                    aria-label={t("Delete the {{status}} status first", {
                      status: MILESTONE_LABELS[blocker],
                    })}
                    className="inline-flex"
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
            <AlertDialog
              onOpenChange={(open, eventDetails) => {
                if (
                  shouldBlockOverlayDismiss({
                    isLocked: isDeleting,
                    open,
                    reason: eventDetails.reason,
                  })
                ) {
                  eventDetails.cancel();
                }
              }}
            >
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
                  <AlertDialogCancel render={<FormCancelButton form={deleteForm} />}>
                    {t("Cancel")}
                  </AlertDialogCancel>
                  <SubmitButton
                    form={deleteForm}
                    IconComponent={TrashIcon}
                    iconPosition="start"
                    variant="destructive"
                  >
                    {t("Delete status")}
                  </SubmitButton>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <EditorActions isBusy={isDeleting} />
        </div>
      </Form>
    </>
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
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <FormGuardProvider guard={overlay}>
          <NameForm baby={props.baby} onClose={overlay.close} onUpdate={props.onUpdate} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function NameForm(props: EditorFormProps) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: { name: props.baby.name },
    schema: nameSchema(t),
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
              <Input aria-label={t("Baby Name")} placeholder={t("Baby Name")} {...field} />
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
      <EditorActions isBusy={false} />
    </Form>
  );
}

type JourneyEditorProps = {
  birthJourney: BirthJourney;
  onUpdate: BabyUpdateHandler;
};

function journeySchema() {
  return z
    .object({
      birthJourney: z.enum(BIRTH_JOURNEYS),
    })
    .transform((values): Pick<BabyPatch, "birthJourney"> => values);
}

export function JourneyEditor(props: JourneyEditorProps) {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button aria-label={t("Edit journey")} size="sm" variant="outline">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1rem)]">
        <FormGuardProvider guard={overlay}>
          <JourneyForm
            birthJourney={props.birthJourney}
            onClose={overlay.close}
            onUpdate={props.onUpdate}
          />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function JourneyForm(props: {
  birthJourney: BirthJourney;
  onClose: () => void;
  onUpdate: BabyUpdateHandler;
}) {
  const form = useZodForm({
    defaultValues: { birthJourney: props.birthJourney },
    schema: journeySchema(),
  });
  const birthJourney = useWatch({ control: form.control, name: "birthJourney" });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onUpdate(values);
        props.onClose();
      }}
    >
      <div className="mb-3">
        <JourneyMilestoneEditor
          birthJourney={birthJourney}
          idPrefix="settings-journey"
          onBirthJourneyChange={(next) => {
            form.setValue("birthJourney", next, { shouldDirty: true, shouldTouch: true });
          }}
        />
      </div>
      <EditorActions isBusy={false} />
    </Form>
  );
}

type ThemeSelectorProps = {
  baby: BabyData;
  onUpdate: BabyUpdateHandler;
};

function ThemeSwatches(props: { colors: ReadonlyArray<string> }) {
  return (
    <span className="flex gap-0.5">
      {props.colors.map((color, index) => (
        <span
          className="size-4 rounded-sm border border-border/50"
          key={index}
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function ThemeOptionList(props: {
  onPick: (theme: string | null) => void;
  selectedValue: string | null | undefined;
}) {
  const { t } = useI18n();
  const { isSubmitting } = useFormState();
  const pendingTheme = useWatch({ name: "theme" });

  return (
    <div className="flex flex-col gap-1">
      {THEME_OPTIONS.map((option) => {
        const isPending = isSubmitting && pendingTheme === option.value;
        return (
          <Button
            aria-busy={isPending}
            aria-pressed={props.selectedValue === option.value}
            className="w-full justify-start gap-2"
            disabled={isSubmitting}
            key={option.value ?? "default"}
            onClick={() => {
              props.onPick(option.value);
            }}
            size="sm"
            type="submit"
            variant={props.selectedValue === option.value ? "default" : "ghost"}
          >
            <ThemeSwatches colors={option.colors} />
            <span className="min-w-0 flex-1 text-left">{t(option.labelKey)}</span>
            {isPending ? (
              <span className="submit-icon-swap-in inline-grid size-4 shrink-0 place-items-center">
                <Spinner className="size-4" />
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export function ThemeSelector(props: ThemeSelectorProps) {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });
  const selectedTheme = getThemeOption(props.baby.theme);
  const form = useZodForm({
    defaultValues: { theme: props.baby.theme ?? null },
    schema: z
      .object({
        theme: z.union([z.string(), z.null()]),
      })
      .transform((values): Pick<BabyPatch, "theme"> => values),
  });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button aria-label={t("Change theme")} className="gap-2" size="sm" variant="outline">
            {selectedTheme ? (
              <>
                <ThemeSwatches colors={selectedTheme.colors} />
                {t(selectedTheme.labelKey)}
              </>
            ) : (
              t("Change")
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-56">
        <FormGuardProvider guard={overlay}>
          <Form
            form={form}
            handleSubmit={async (values) => {
              await props.onUpdate(values);
              overlay.close();
            }}
          >
            <ThemeOptionList
              onPick={(theme) => {
                form.setValue("theme", theme, { shouldDirty: true });
              }}
              selectedValue={selectedTheme?.value}
            />
          </Form>
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}
