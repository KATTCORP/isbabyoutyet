import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { NavigateOptions } from "@tanstack/react-router";
import { z } from "zod";
import type { FunctionArgs } from "convex/server";
import { useConvex, useMutation } from "convex/react";
import type { ReactMutation } from "convex/react";
import { api } from "@workspace/convex/convex/_generated/api";
import type { Id } from "@workspace/convex/convex/_generated/dataModel";
import { ensureWebPushSubscription } from "@/lib/web-push-subscription";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { DueDateDisplayFields } from "@/components/baby/dueDateDisplayFields";
import { AddBabyOptionalSettings } from "@/components/baby/add-baby-optional-settings";
import { OwnerMessageNotifyFormField } from "@/components/baby/owner-message-notify-switch";
import { needsIosPushInstall } from "@/components/baby/notification-subscribe";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Form, FormGuardProvider, SubmitButton, useFormGuard, useZodForm } from "@/components/Form";
import { htmlDate } from "@/lib/html-date";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

function addBabySchema(t: TranslationFunction) {
  return z
    .object({
      birthJourney: z.union([
        z.literal("labor"),
        z.literal("home_birth"),
        z.literal("planned_c_section"),
        z.literal("custom"),
      ]),
      dueDate: htmlDate(t),
      name: z.string().trim().min(2, t("Name is required")),
      notifyOnMessages: z.boolean(),
      publicDueDateText: z.string().trim().max(80, t("Keep this under 80 characters")),
      showExactDueDate: z.boolean(),
      theme: z.union([z.string(), z.null()]),
    })
    .superRefine((values, ctx) => {
      if (values.showExactDueDate && !values.dueDate) {
        ctx.addIssue({
          code: "custom",
          message: t("Pick a date"),
          path: ["dueDate"],
        });
      }
    })
    .transform((values) => ({
      create: {
        birthJourney: values.birthJourney,
        dueDate: values.dueDate,
        dueDateDisplayMode: values.showExactDueDate ? "exact" : "message",
        name: values.name,
        publicDueDateText: values.publicDueDateText || null,
        theme: values.theme,
      } satisfies FunctionArgs<typeof api.baby.create>,
      notifyOnMessages: values.notifyOnMessages,
    }));
}

export const Route = createFileRoute("/_auth/dashboard_/add")({
  component: AddBabyPage,
});

export type CreateBaby = ReactMutation<typeof api.baby.create>;

export function AddBabyPage() {
  const { t } = useI18n();
  const router = useRouter();
  const convex = useConvex();
  const createBaby = useMutation(api.baby.create);
  const subscribeAsOwner = useMutation(api.pushSubscriptions.subscribeAsOwner);

  return (
    <AddBabyPageView
      createBaby={createBaby}
      navigate={(opts) => router.navigate(opts)}
      subscribeOwnerMessages={async (babyId) => {
        if (needsIosPushInstall()) {
          return;
        }
        const vapidPublicKey = await convex.query(api.pushSubscriptions.getPublicKey, {});
        const keys = await ensureWebPushSubscription(vapidPublicKey, { t });
        await subscribeAsOwner({
          auth: keys.auth,
          babyId,
          endpoint: keys.endpoint,
          p256dh: keys.p256dh,
          userAgent: navigator.userAgent,
        });
      }}
    />
  );
}

/**
 * Presentational add-baby form. Mutation + navigate arrive as props so tests
 * can drive submit without mocking Convex or the router module.
 *
 * @internal exported for tests
 */
export function AddBabyPageView(props: {
  createBaby: CreateBaby;
  navigate: (opts: NavigateOptions) => Promise<void>;
  subscribeOwnerMessages: ((babyId: Id<"baby">) => Promise<void>) | null;
}) {
  const { t } = useI18n();
  const guard = useFormGuard(null);

  const form = useZodForm({
    defaultValues: {
      birthJourney: "labor" as const,
      dueDate: "",
      name: "",
      notifyOnMessages: false,
      publicDueDateText: "",
      showExactDueDate: true,
      theme: null,
    },
    schema: addBabySchema(t),
  });

  return (
    <FormGuardProvider guard={guard}>
      <div className="min-h-screen bg-background bg-dots">
        <div className="mx-auto max-w-xl px-6 py-10">
          <Button
            className="mb-8 rounded-full border-2 font-bold"
            nativeButton={false}
            render={<Link to="/dashboard" />}
            size="sm"
            variant="outline"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {t("Back to Dashboard")}
          </Button>

          <div className="mb-8 text-center">
            <p aria-hidden="true" className="text-5xl">
              🎉
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              {t("Add a")}{" "}
              <span className="inline-block -rotate-1 rounded-2xl bg-primary/15 px-3 text-primary">
                {t("baby")}
              </span>
            </h1>
            <p className="mt-2 font-semibold text-muted-foreground">
              {t("A name and a due date — that's all it takes!")}
            </p>
          </div>

          <Card className="rounded-[2rem] border-2 pop-shadow-strong">
            <CardContent className="pt-6">
              <Form
                form={form}
                handleSubmit={async (values) => {
                  const result = await props.createBaby(values.create);
                  if (values.notifyOnMessages && props.subscribeOwnerMessages) {
                    try {
                      await props.subscribeOwnerMessages(result.babyId);
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : t("Failed to subscribe to notifications"),
                      );
                    }
                  }

                  await props.navigate({
                    params: { publicId: result.publicId },
                    to: "/baby/$publicId",
                  });
                }}
              >
                <div className="flex flex-col gap-5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={(renderProps) => (
                      <FormItem>
                        <FormLabel className="font-bold">{t("Baby Name")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("Enter baby's name")} {...renderProps.field} />
                        </FormControl>
                        <FormDescription>
                          {t(
                            "Optional — leave blank for now. You can change the time later in settings.",
                          )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DueDateDisplayFields
                    className={undefined}
                    control={form.control}
                    dateFieldName="dueDate"
                    publicDueDateTextFieldName="publicDueDateText"
                    sectionLabelClassName="font-bold"
                    showExactDueDateFieldName="showExactDueDate"
                    stopPopoverPropagation={false}
                  />

                  <OwnerMessageNotifyFormField control={form.control} name="notifyOnMessages" />

                  <AddBabyOptionalSettings
                    birthJourneyFieldName="birthJourney"
                    control={form.control}
                    themeFieldName="theme"
                  />

                  <SubmitButton
                    className="w-full rounded-full font-extrabold pop-shadow"
                    form="context"
                    IconComponent="🍼"
                    iconPosition="end"
                    size="lg"
                  >
                    {t("Add Baby")}
                  </SubmitButton>
                </div>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </FormGuardProvider>
  );
}
