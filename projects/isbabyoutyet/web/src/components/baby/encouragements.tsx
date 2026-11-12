/**
 * The encouragement form, and the server function a browser posts it to
 * while the page's JS is not running. `encouragementPost` describes the post
 * once for both (see `@/lib/form-post`).
 */
import { SubmitButton } from "@/components/Form";
import { PostForm, useFormPost } from "@/components/PostForm";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { invalidateMany } from "@raf-query/react";
import { useQueryClient } from "@/lib/raf";
import type { FunctionArgs } from "convex/server";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { babyFeedItemUrl, babyPageUrl } from "@isbabyoutyet/backend/src/babyFeedUrl";
import { isString } from "@workspace/runtime/guards";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import {
  readEncouragementFormDraft,
  clearEncouragementMessageDraft,
} from "@/lib/encouragement-message-draft";
import { formPost, postedForm } from "@/lib/form-post";
import { answerFormPost } from "@/lib/form-post.server";
import { useEncouragementMessageDraft } from "@/lib/use-encouragement-message-draft";
import { useClientHydration } from "@/lib/use-client-hydration";
import { getVisitorId } from "@/lib/use-visitor-id";
import { visitorTagQuery } from "@/lib/visitor-tag";
import { useWatch } from "react-hook-form";

type EncouragementFormProps = {
  accountName: string | null;
  babyId: Id<"baby">;
  babyName: string;
  publicId: string;
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
function encouragementFields(t: TranslationFunction) {
  return z.object({
    authorName: z
      .string()
      .trim()
      .min(1, t("Name is required"))
      .max(
        MAX_NAME_LENGTH,
        t("Name must be {{count}} characters or less", { count: MAX_NAME_LENGTH }),
      ),
    message: z.string().trim().min(1, t("Message is required")),
  });
}

/** What the baby page already knows, sent along in hidden inputs. */
const encouragementCarried = z.object({
  babyId: z.custom<Id<"baby">>(isString),
  publicId: z.string().min(1),
});

/** What the mutation asks about the visitor, which only the sender can tell. */
type EncouragementSender = Pick<
  FunctionArgs<typeof api.encouragements.create>,
  "locale" | "timezone" | "userAgent" | "visitorId"
>;

function senderInBrowser(): EncouragementSender {
  return {
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    visitorId: getVisitorId(),
  };
}

/** A browser that posted the form by itself, as far as its request tells. */
function senderOfRequest(request: Request): EncouragementSender {
  return {
    locale: request.headers.get("accept-language")?.split(",")[0] ?? null,
    timezone: null,
    userAgent: request.headers.get("user-agent"),
    // Nobody holds this id, so the message is nobody's to edit or delete.
    visitorId: crypto.randomUUID(),
  };
}

/** @internal exported for tests */
export const encouragementPost = formPost({
  args: (input) => ({
    authorName: input.fields.authorName,
    babyId: input.carried.babyId,
    message: input.fields.message,
    ...(input.request ? senderOfRequest(input.request) : senderInBrowser()),
  }),
  carried: encouragementCarried,
  fields: encouragementFields,
  id: "encourage",
  // The new message's permalink highlights it, and is a URL the CDN has no
  // copy of yet, so the page is rendered with the message in it.
  landing: (input) =>
    babyFeedItemUrl({ itemId: input.result.timelineItemId, publicId: input.carried.publicId }),
  mutation: api.encouragements.create,
  page: (carried) => babyPageUrl(carried.publicId),
});

const postEncouragement = createServerFn({ method: "POST" })
  .validator(postedForm)
  .handler((ctx) => answerFormPost(encouragementPost, ctx.data));

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
      publicId={props.publicId}
    />
  );
}

function EncouragementFormFields(
  props: Omit<EncouragementFormProps, "accountName"> & {
    initialAuthorName: string;
    initialMessage: string;
  },
) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const post = useFormPost(encouragementPost, {
    action: postEncouragement,
    carried: { babyId: props.babyId, publicId: props.publicId },
    defaultValues: {
      authorName: props.initialAuthorName,
      message: props.initialMessage,
    },
  });
  const form = post.form;
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

      <PostForm
        failedMessage={t("Failed to send encouragement")}
        handleSubmit={async (values) => {
          // Save name to localStorage for next time
          localStorage.setItem(STORAGE_KEY_NAME, values.authorName);

          const promise = post.send(values).then(async (it) => {
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
          // A first post creates the visitor id, so no page's tag is `null` any more.
          void invalidateMany(queryClient, visitorTagQuery);
          clearEncouragementMessageDraft(props.babyId);
          form.reset({ authorName: values.authorName, message: "" });
        }}
        post={post}
      >
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="authorName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Your name")}</FormLabel>
                <FormControl>
                  <Input {...post.native("authorName")} placeholder={t("Your name")} {...field} />
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
                    {...post.native("message")}
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
      </PostForm>
    </div>
  );
}
