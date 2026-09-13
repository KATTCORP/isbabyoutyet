import { Form, SubmitButton, useZodForm } from "@/components/Form";
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
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { z } from "zod";
import type { Id } from "@baby-outlet/backend/convex/_generated/dataModel";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import {
  readEncouragementFormDraft,
  clearEncouragementMessageDraft,
} from "@/lib/encouragement-message-draft";
import { useEncouragementMessageDraft } from "@/lib/use-encouragement-message-draft";
import { useClientHydration } from "@/lib/use-client-hydration";
import { getVisitorId } from "@/lib/use-visitor-id";
import { useWatch } from "react-hook-form";

type EncouragementFormProps = {
  accountName: string | null;
  babyId: Id<"baby">;
  babyName: string;
};

const MAX_NAME_LENGTH = 50;
const STORAGE_KEY_NAME = "encouragement-author-name";

function getStoredAuthorName() {
  if (globalThis.window === undefined) {
    return "";
  }
  return localStorage.getItem(STORAGE_KEY_NAME) ?? "";
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
      authorName: values.authorName,
      babyId,
      locale: globalThis.navigator !== undefined ? navigator.language : null,
      message: values.message,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: globalThis.navigator !== undefined ? navigator.userAgent : null,
      visitorId: getVisitorId(),
    }));
}

export function EncouragementForm(props: EncouragementFormProps) {
  const hydrated = useClientHydration();
  const sessionDraft = hydrated ? readEncouragementFormDraft(props.babyId) : null;
  const storedAuthorName = hydrated ? getStoredAuthorName() : "";
  return (
    <EncouragementFormFields
      babyId={props.babyId}
      babyName={props.babyName}
      initialAuthorName={
        sessionDraft?.hasDraft
          ? sessionDraft.authorName
          : storedAuthorName || props.accountName || ""
      }
      initialMessage={sessionDraft?.message ?? ""}
      key={hydrated ? "hydrated" : "server"}
    />
  );
}

function EncouragementFormFields(
  props: { babyId: Id<"baby">; babyName: string } & {
    initialAuthorName: string;
    initialMessage: string;
  },
) {
  const { t } = useI18n();
  const createEncouragement = useMutation(api.encouragements.create);
  const schema = encouragementSchema(t, props.babyId);

  const form = useZodForm({
    defaultValues: {
      authorName: props.initialAuthorName,
      message: props.initialMessage,
    },
    schema,
  });
  const message = useWatch({ control: form.control, name: "message" }) ?? "";
  const authorName = useWatch({ control: form.control, name: "authorName" }) ?? "";
  useEncouragementMessageDraft({ authorName, babyId: props.babyId, message });

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <p aria-hidden="true" className="text-3xl">
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
            /* v8 ignore next 3 */
            if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            return it;
          });

          toast.promise(promise, {
            error: (err) =>
              err instanceof Error ? err.message : t("Failed to send encouragement"),
            loading: t("Sending your encouragement..."),
            success: t("Your kind words have been sent! 💕"),
          });
          await promise;
          clearEncouragementMessageDraft(props.babyId);
          form.reset({ authorName: values.authorName, message: "" });
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
                  <Input maxLength={MAX_NAME_LENGTH} placeholder={t("Your name")} {...field} />
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
                    className="min-h-24"
                    placeholder={t("Write your message of encouragement...")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <SubmitButton
            className="w-full"
            form="context"
            IconComponent={PaperPlaneTiltIcon}
            iconPosition="start"
          >
            {t("Send Encouragement")}
          </SubmitButton>
        </div>
      </Form>
    </div>
  );
}
