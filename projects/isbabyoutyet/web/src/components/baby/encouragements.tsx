/**
 * The encouragement form. `encouragement-post.ts` says what it sends, with
 * the page's JS and without.
 */
import {
  encouragementPost,
  postEncouragement,
  recallAuthorName,
} from "@/components/baby/encouragement-post";
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
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { useI18n } from "@/lib/i18n";
import {
  readEncouragementFormDraft,
  clearEncouragementMessageDraft,
} from "@/lib/encouragement-message-draft";
import { useEncouragementMessageDraft } from "@/lib/use-encouragement-message-draft";
import { visitorTagQuery } from "@/lib/visitor-tag";
import { useWatch } from "react-hook-form";

type EncouragementFormProps = {
  accountName: string | null;
  babyId: Id<"baby">;
  babyName: string;
  publicId: string;
};

export function EncouragementForm(props: EncouragementFormProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const post = useFormPost(encouragementPost, {
    action: postEncouragement,
    carried: { babyId: props.babyId, publicId: props.publicId },
    defaultValues: { authorName: props.accountName ?? "", message: "" },
    // A draft left in this tab first, then the name used last time.
    restore: () => {
      const draft = readEncouragementFormDraft(props.babyId);
      return {
        authorName: draft.hasDraft
          ? draft.authorName
          : recallAuthorName() || props.accountName || "",
        message: draft.message,
      };
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
