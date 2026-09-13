import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@workspace/ui/components/item";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  BabyIcon,
  CalendarHeartIcon,
  ConfettiIcon,
  HeartbeatIcon,
  HospitalIcon,
  PaletteIcon,
  TranslateIcon,
  TrashIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import type {
  BabyData,
  BabyUpdateHandler,
  BirthJourney,
  MilestoneRedateHandler,
  MilestoneRemoveHandler,
} from "@baby-outlet/backend/src/types";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import type { PreloadedConvexQuery } from "@workspace/convex-prefetch";
import type { InitiatedQuery } from "@workspace/query-prefetch";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import {
  DueDateEditor,
  JourneyEditor,
  NameEditor,
  StatusDateEditor,
  ThemeSelector,
} from "./editors";
import { CoParentsSettings } from "./co-parents-settings";
import { OwnerMessageNotifyLiveSwitch } from "./owner-message-notify-switch";
import type { BrowserPushCapabilityFactory } from "./notification-subscribe";
import { formatDate, formatDueDate, getRelativeTime, getThemeOption } from "./utils";
import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "@baby-outlet/backend/src/i18n";
import { isString } from "@workspace/runtime/guards";
import {
  Form,
  FormCancelButton,
  FormGuardProvider,
  SubmitButton,
  useFormGuard,
  useZodForm,
} from "@/components/Form";
import { getLanguageName, useI18n } from "@/lib/i18n";
import type { OverlayControl } from "@/lib/overlay-nav";
import { JOURNEY_OPTION_BY_VALUE } from "./journey-options";
import type { ReactNode } from "react";
import { useWatch } from "react-hook-form";
import { z } from "zod";

const emptyActionSchema = z.object({});

type SettingsPanelProps = {
  baby: BabyData;
  birthJourney: BirthJourney;
  /** Null on the preview page (no real baby id). */
  coParents: {
    babyId: Id<"baby">;
    isOwner: boolean;
    listing: PreloadedConvexQuery<typeof api.coParents.listForBaby>;
  } | null;
  /** Null on the preview page (no push subscription). */
  messagePush: {
    babyId: Id<"baby">;
    browserPush: InitiatedQuery<BrowserPushCapabilityFactory>;
    vapidPublicKey: PreloadedConvexQuery<typeof api.pushSubscriptions.getPublicKey>;
  } | null;
  /** Owner-only soft delete. Null on the preview page / for co-parents. */
  onDelete: (() => void | Promise<void>) | null;
  onMilestoneRedate: MilestoneRedateHandler;
  onMilestoneRemove: MilestoneRemoveHandler;
  onUpdate: BabyUpdateHandler;
  /** Open state, guarded dismissal, and close-complete navigation for the dialog. */
  overlay: OverlayControl;
  profileLocale: SupportedLocale;
};

function SettingsSection(props: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {props.title}
      </h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card/50">
        <ItemGroup className="gap-0">{props.children}</ItemGroup>
      </div>
    </section>
  );
}

function BabyLanguageSelect(props: {
  inheritedLocale: SupportedLocale;
  onUpdate: BabyUpdateHandler;
  value: SupportedLocale | null | undefined;
}) {
  const { locale, t } = useI18n();
  const inheritLabel = t("Use my profile language ({{language}})", {
    language: getLanguageName(props.inheritedLocale, locale),
  });
  const languageItems = [
    { label: inheritLabel, value: "inherit" },
    ...SUPPORTED_LOCALES.map((supportedLocale) => ({
      label: getLanguageName(supportedLocale, locale),
      value: supportedLocale,
    })),
  ];
  const form = useZodForm({
    defaultValues: { locale: props.value ?? "inherit" },
    schema: z
      .object({
        locale: z.union([z.literal("inherit"), z.enum(SUPPORTED_LOCALES)]),
      })
      .transform((values) => ({
        locale: values.locale === "inherit" ? null : values.locale,
      })),
  });
  const selectedLocale = useWatch({ control: form.control, name: "locale" });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        try {
          await props.onUpdate(values);
        } catch (error) {
          form.reset({ locale: props.value ?? "inherit" });
          throw error;
        }
      }}
    >
      <Select
        items={languageItems}
        onValueChange={(value) => {
          if (value !== "inherit" && !(isString(value) && isSupportedLocale(value))) {
            return;
          }
          form.setValue("locale", value, { shouldDirty: true });
          form.formRef.current?.requestSubmit();
        }}
        value={selectedLocale}
      >
        <SelectTrigger aria-label={t("Language")} className="max-w-44" size="sm">
          <SelectValue />
        </SelectTrigger>
        {/* Wider than the capped trigger so long inherit labels are not clipped */}
        <SelectContent alignItemWithTrigger={false} className="w-auto min-w-44">
          <SelectGroup>
            {languageItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Form>
  );
}

function DeleteBabyPageForm(props: { babyName: string; onDelete: () => void | Promise<void> }) {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });
  const form = useZodForm({
    defaultValues: {},
    schema: emptyActionSchema,
  });

  return (
    <AlertDialog {...overlay.rootProps}>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="destructive">
            {t("Delete")}
          </Button>
        }
      />
      <AlertDialogContent>
        <FormGuardProvider guard={overlay}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Delete {{name}}'s page?", { name: props.babyName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "The page will disappear from your dashboard and the public link will stop working. Only you (the owner) can do this.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Form
            form={form}
            handleSubmit={async () => {
              await props.onDelete();
            }}
          >
            <AlertDialogFooter>
              <AlertDialogCancel render={<FormCancelButton form="context" />}>
                {t("Cancel")}
              </AlertDialogCancel>
              <SubmitButton
                form="context"
                IconComponent={TrashIcon}
                iconPosition="start"
                variant="destructive"
              >
                {t("Delete page")}
              </SubmitButton>
            </AlertDialogFooter>
          </Form>
        </FormGuardProvider>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Owner settings: page metadata and corrections. Marking milestones and
 * posting photos happens through the "Post update" composer; milestone rows
 * here appear once marked, for correcting their date. Unmarking a milestone
 * is done by deleting its update in the timeline.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  const { locale, t } = useI18n();
  const inheritedLocale = props.profileLocale;
  const onDelete = props.onDelete;
  const coParents = props.coParents;
  const messagePush = props.messagePush;
  const journeyOption = JOURNEY_OPTION_BY_VALUE[props.birthJourney];
  return (
    <Dialog {...props.overlay.rootProps}>
      <FormGuardProvider guard={props.overlay.guard}>
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,40rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Settings")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <SettingsSection title={t("Page details")}>
              <Item>
                <ItemMedia variant="icon">
                  <BabyIcon className="w-4 h-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("Baby Name")}</ItemTitle>
                  <ItemDescription>{props.baby.name}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <NameEditor baby={props.baby} onUpdate={props.onUpdate} />
                </ItemActions>
              </Item>

              <ItemSeparator />

              <Item>
                <ItemMedia variant="icon">
                  <CalendarHeartIcon className="w-4 h-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("Due Date")}</ItemTitle>
                  <ItemDescription>
                    {props.baby.dueDateDisplayMode === "message" ? (
                      props.baby.publicDueDateText?.trim() ? (
                        t("Visitors see “{{text}}”.", { text: props.baby.publicDueDateText })
                      ) : (
                        t("Due date hidden from visitors.")
                      )
                    ) : (
                      <>
                        {props.baby.dueDate ? formatDueDate(props.baby.dueDate, locale) : ""} ·{" "}
                        {t("Visitors see the exact date and countdown.")}
                      </>
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <DueDateEditor baby={props.baby} onUpdate={props.onUpdate} />
                </ItemActions>
              </Item>
            </SettingsSection>

            <SettingsSection title={t("Birth journey")}>
              <Item>
                <ItemMedia variant="icon">
                  <HeartbeatIcon className="w-4 h-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("Journey")}</ItemTitle>
                  <ItemDescription>{t(journeyOption.descriptionKey)}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <JourneyEditor birthJourney={props.birthJourney} onUpdate={props.onUpdate} />
                </ItemActions>
              </Item>

              {/* Marked milestones: correct their date here; mark new ones via
              the "Post update" composer, unmark by deleting the timeline
              update */}
              {props.baby.laborStarted && (
                <>
                  <ItemSeparator />
                  <Item>
                    <ItemMedia variant="icon">
                      <HeartbeatIcon className="w-4 h-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("Labour started")}</ItemTitle>
                      <ItemDescription>
                        {formatDate(props.baby.laborStarted, {
                          locale,
                          timeZone: props.baby.timeZone,
                        })}{" "}
                        ({getRelativeTime(props.baby.laborStarted, locale)})
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <StatusDateEditor
                        baby={props.baby}
                        currentDate={props.baby.laborStarted}
                        onRedate={props.onMilestoneRedate}
                        onRemove={props.onMilestoneRemove}
                        status="labor_started"
                      />
                    </ItemActions>
                  </Item>
                </>
              )}

              {props.baby.wentToHospital && (
                <>
                  <ItemSeparator />
                  <Item>
                    <ItemMedia variant="icon">
                      <HospitalIcon className="w-4 h-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("Gone to hospital")}</ItemTitle>
                      <ItemDescription>
                        {formatDate(props.baby.wentToHospital, {
                          locale,
                          timeZone: props.baby.timeZone,
                        })}{" "}
                        ({getRelativeTime(props.baby.wentToHospital, locale)})
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <StatusDateEditor
                        baby={props.baby}
                        currentDate={props.baby.wentToHospital}
                        onRedate={props.onMilestoneRedate}
                        onRemove={props.onMilestoneRemove}
                        status="gone_to_hospital"
                      />
                    </ItemActions>
                  </Item>
                </>
              )}

              {props.baby.babyBorn && (
                <>
                  <ItemSeparator />
                  <Item>
                    <ItemMedia variant="icon">
                      <ConfettiIcon className="w-4 h-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t("Baby born")}</ItemTitle>
                      <ItemDescription>
                        {formatDate(props.baby.babyBorn, {
                          locale,
                          timeZone: props.baby.timeZone,
                        })}{" "}
                        ({getRelativeTime(props.baby.babyBorn, locale)})
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <StatusDateEditor
                        baby={props.baby}
                        currentDate={props.baby.babyBorn}
                        onRedate={props.onMilestoneRedate}
                        onRemove={props.onMilestoneRemove}
                        status="born"
                      />
                    </ItemActions>
                  </Item>
                </>
              )}
            </SettingsSection>

            <SettingsSection title={t("Appearance")}>
              <Item>
                <ItemMedia variant="icon">
                  <PaletteIcon className="w-4 h-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("Theme")}</ItemTitle>
                  <ItemDescription>
                    {t(getThemeOption(props.baby.theme)?.labelKey ?? "Mango")}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ThemeSelector baby={props.baby} onUpdate={props.onUpdate} />
                </ItemActions>
              </Item>

              <ItemSeparator />

              <Item>
                <ItemMedia variant="icon">
                  <TranslateIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("Language")}</ItemTitle>
                  <ItemDescription>
                    {t("All visitors see this page in {{language}}.", {
                      language: getLanguageName(props.baby.locale ?? inheritedLocale, locale),
                    })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <BabyLanguageSelect
                    inheritedLocale={inheritedLocale}
                    onUpdate={props.onUpdate}
                    value={props.baby.locale}
                  />
                </ItemActions>
              </Item>
            </SettingsSection>

            {messagePush && (
              <SettingsSection title={t("Notifications")}>
                <OwnerMessageNotifyLiveSwitch
                  babyId={messagePush.babyId}
                  browserPush={messagePush.browserPush}
                  vapidPublicKey={messagePush.vapidPublicKey}
                />
              </SettingsSection>
            )}

            {coParents && (
              <SettingsSection title={t("Access")}>
                <Item className="items-start" variant="default">
                  <ItemMedia variant="icon">
                    <UsersIcon className="w-4 h-4" />
                  </ItemMedia>
                  <ItemContent className="gap-3">
                    <div>
                      <ItemTitle>{t("Co-parents")}</ItemTitle>
                      <ItemDescription>
                        {coParents.isOwner
                          ? t("People who can post updates and change settings")
                          : t("Others who can manage this page with you")}
                      </ItemDescription>
                    </div>
                    <CoParentsSettings
                      babyId={coParents.babyId}
                      isOwner={coParents.isOwner}
                      listing={coParents.listing}
                    />
                  </ItemContent>
                </Item>
              </SettingsSection>
            )}

            {onDelete && (
              <SettingsSection title={t("Danger zone")}>
                <Item>
                  <ItemMedia variant="icon">
                    <TrashIcon className="w-4 h-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t("Delete page")}</ItemTitle>
                    <ItemDescription>{t("Hide this baby page from everyone")}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <DeleteBabyPageForm babyName={props.baby.name} onDelete={onDelete} />
                  </ItemActions>
                </Item>
              </SettingsSection>
            )}
          </div>
        </DialogContent>
      </FormGuardProvider>
    </Dialog>
  );
}
