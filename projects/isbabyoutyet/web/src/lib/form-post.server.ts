/**
 * The server's half of a {@link FormPost}. Call it from the handler of the
 * form's server function, and nowhere else: the build refuses to put a
 * `*.server.*` file in the browser's bundle.
 */
import { DEFAULT_LOCALE } from "@isbabyoutyet/backend/src/i18n";
import { getRequest } from "@tanstack/react-start/server";
import { captureException } from "@workspace/sentry/server";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import type { z } from "zod";
import { authServer } from "@/lib/auth-server";
import { formPostResponse } from "@/lib/form-post";
import type { FormPost, HiddenInputs } from "@/lib/form-post";
import { translate } from "@/lib/i18n";

/**
 * Answers the form the browser posted by itself: calls the form's mutation
 * as the visitor (their session cookie, if they have one) and redirects.
 */
export async function answerFormPost<
  TMutation extends FunctionReference<"mutation", "public">,
  TFields extends z.ZodObject,
  TCarried extends HiddenInputs,
>(post: FormPost<TMutation, TFields, TCarried>, data: FormData) {
  const convex = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
  const token = await authServer.getToken();
  if (token) {
    convex.setAuth(token);
  }
  return await formPostResponse(post, {
    data,
    mutate: (args) => convex.mutation(post.mutation, args),
    report: captureException,
    request: getRequest(),
    // The messages go nowhere: a post that fails its checks lands on the
    // form's own notice, in the page's language.
    t: (key, ...args) => translate(DEFAULT_LOCALE, key, ...args),
  });
}
