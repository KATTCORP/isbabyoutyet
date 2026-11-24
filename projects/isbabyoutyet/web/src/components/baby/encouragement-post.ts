/**
 * What the encouragement form sends, and the server function a browser
 * posts it to while the page's JS is not running. The form itself is
 * `encouragements.tsx`. See `@/lib/form-post`.
 */
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { babyFeedItemUrl, babyPageUrl } from "@isbabyoutyet/backend/src/babyFeedUrl";
import { createServerFn } from "@tanstack/react-start";
import { isString } from "@workspace/runtime/guards";
import type { FunctionArgs } from "convex/server";
import { z } from "zod";
import { formPost, postedForm } from "@/lib/form-post";
import { answerFormPost } from "@/lib/form-post.server";
import type { TranslationFunction } from "@/lib/i18n";
import { recallInBrowser } from "@/lib/remembered";
import { peekVisitorId, rememberedVisitorId, visitorIdOfRequest } from "@/lib/use-visitor-id";

const MAX_NAME_LENGTH = 50;
const AUTHOR_NAME = "author-name";
/** Where the name lived before it was a cookie. Still read, until the next post moves it. */
const EARLIER_NAME_STORAGE_KEY = "encouragement-author-name";

/** The name this browser's visitor signed their last message with, or "". */
export function recallAuthorName() {
  if (globalThis.window === undefined) {
    return "";
  }
  return recallInBrowser(AUTHOR_NAME) ?? localStorage.getItem(EARLIER_NAME_STORAGE_KEY) ?? "";
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

/** A first post makes the visitor's id up. `remembers` keeps it once the post worked. */
function senderInBrowser(): EncouragementSender {
  return {
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    visitorId: peekVisitorId() ?? crypto.randomUUID(),
  };
}

/** A browser that posted the form by itself, as far as its request tells. */
function senderOfRequest(request: Request): EncouragementSender {
  return {
    locale: request.headers.get("accept-language")?.split(",")[0] ?? null,
    timezone: null,
    userAgent: request.headers.get("user-agent"),
    visitorId: visitorIdOfRequest(request) ?? crypto.randomUUID(),
  };
}

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
  remembers: (args) => [
    rememberedVisitorId(args.visitorId),
    { name: AUTHOR_NAME, value: args.authorName },
  ],
});

/** Where the browser posts the form by itself. */
export const postEncouragement = createServerFn({ method: "POST" })
  .validator(postedForm)
  .handler((ctx) => answerFormPost(encouragementPost, ctx.data));
