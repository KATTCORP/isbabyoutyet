import { Form, useZodForm } from "@/components/Form";
import { Button } from "@workspace/ui/components/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

type EncouragementFormProps = {
  babyId: Id<"baby">;
  babyName: string;
};

const MAX_NAME_LENGTH = 50;
const STORAGE_KEY_NAME = "encouragement-author-name";
const STORAGE_KEY_VISITOR_ID = "encouragement-visitor-id";

// Get or create a unique visitor ID (immutable once created) - client-side only
export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let visitorId = localStorage.getItem(STORAGE_KEY_VISITOR_ID);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY_VISITOR_ID, visitorId);
  }
  return visitorId;
}

// Trim before validating, so whitespace-only input doesn't pass "required"
function encouragementSchema(t: TranslationFunction, babyId: Id<"baby">) {
  return z
    .object({
      authorName: z
        .string()
        .trim()
        .min(1, t("Name is required"))
        .max(
          MAX_NAME_LENGTH,
          t("Name must be {{count}} characters or less", { count: MAX_NAME_LENGTH }),
        ),
      message: z.string().trim().min(1, t("Message is required")),
    })
    .transform((values): FunctionArgs<typeof api.encouragements.create> => ({
      babyId,
      authorName: values.authorName,
      message: values.message,
      visitorId: getVisitorId(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
}

export function EncouragementForm(props: EncouragementFormProps) {
  const { t } = useI18n();
  const createEncouragement = useMutation(api.encouragements.create);
  const schema = encouragementSchema(t, props.babyId);

  const form = useZodForm({
    schema,
    defaultValues: {
      authorName: "",
      message: "",
    },
  });

  // Load saved name from localStorage on mount (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedName = localStorage.getItem(STORAGE_KEY_NAME);
    if (savedName) {
      form.setValue("authorName", savedName);
    }
  }, [form]);

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <p className="text-3xl" aria-hidden="true">
          💛
        </p>
        <h3 className="mt-2 text-xl font-extrabold text-foreground">{t("Send some love")}</h3>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {t("Leave a message of support for {{name}}'s family", { name: props.babyName })}
        </p>
      </div>

      <Form
        form={form}
        handleSubmit={async (values) => {
          // Save name to localStorage for next time
          localStorage.setItem(STORAGE_KEY_NAME, values.authorName);

          const promise = createEncouragement(values).then(async (it) => {
            if (import.meta.env.DEV) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            return it;
          });

          toast.promise(promise, {
            loading: t("Sending your encouragement..."),
            success: t("Your kind words have been sent! 💕"),
            error: (err) =>
              err instanceof Error ? err.message : t("Failed to send encouragement"),
          });
          form.reset({ authorName: values.authorName, message: "" });
          await promise;
        }}
      >
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="authorName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Your name")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("Your name")} maxLength={MAX_NAME_LENGTH} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Message")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("Write your message of encouragement...")}
                    className="min-h-24"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
            <PaperPlaneTilt className="w-4 h-4" />
            {form.formState.isSubmitting ? t("Sending...") : t("Send Encouragement")}
          </Button>
        </div>
      </Form>
    </div>
  );
}
