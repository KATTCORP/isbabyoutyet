/**
 * A form that still works while the page's JS is not running.
 *
 * A {@link FormPost} says, once, what a form sends and where. Both ways of
 * sending it read that one description, so they cannot drift apart:
 *
 * - With JS, `useFormPost` (`@/components/PostForm`) checks `fields` in the
 *   browser and calls `mutation` over the Convex client.
 * - Without JS, the browser posts the form to its server function, which
 *   hands it to `answerFormPost` (`@/lib/form-post.server`): the same
 *   `fields`, the same `args`, the same `mutation`, then a redirect.
 *
 * The README's "Forms without JS" section has the recipe.
 */
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { isBoolean } from "@workspace/runtime/guards";
import { z } from "zod";
import type { TranslationFunction } from "@/lib/i18n";

type PublicMutation = FunctionReference<"mutation", "public">;

/** Hidden inputs carry text, so what a page sends along with a form is text. */
export type HiddenInputs = { readonly [name: string]: string };

export type FormPost<
  TMutation extends PublicMutation,
  TFields extends z.ZodObject,
  TCarried extends HiddenInputs,
> = {
  /**
   * The mutation's arguments. `request` is the browser's own post, and
   * `null` when the page's JS sends: what only one of the two knows (a
   * header, `localStorage`) is decided here, side by side.
   */
  args: (input: {
    carried: TCarried;
    fields: z.output<TFields>;
    request: Request | null;
  }) => FunctionArgs<TMutation>;
  /** What the page already knows. It travels in hidden inputs. */
  carried: z.ZodType<TCarried>;
  /**
   * What the visitor types, by input `name`. The browser checks it before
   * the page's JS sends, and the server when a post arrives.
   */
  fields: (t: TranslationFunction) => TFields;
  /** Names the form on its page. A failed post lands on `#${id}-failed`. */
  id: string;
  /** Without JS: the page that shows the visitor what they just did. */
  landing: (input: { carried: TCarried; result: NoInfer<FunctionReturnType<TMutation>> }) => string;
  mutation: TMutation;
  /** Without JS: the page the form is on, where a failed post goes back to. */
  page: (carried: TCarried) => string;
};

/** Describes a form. Only here to infer the types from the description. */
export function formPost<
  TMutation extends PublicMutation,
  TFields extends z.ZodObject,
  TCarried extends HiddenInputs,
>(post: FormPost<TMutation, TFields, TCarried>) {
  return post;
}

/** The validator of a form's server function: Start hands a posted form over as is. */
export function postedForm(data: FormData) {
  return data;
}

/**
 * The id of a form's failure notice. A failed post without JS redirects to
 * it, and the notice shows itself with `:target`: nothing in the page's HTML
 * changes, so the CDN's copy of the page still serves.
 */
export function formPostFailedId(id: string) {
  return `${id}-failed`;
}

export type NativeChecks = {
  maxLength: number | undefined;
  required: boolean;
};

/**
 * The checks a browser can run by itself, by input `name`, read off the
 * fields' schema, so a form posted without JS is held to the same rules.
 * A field the schema says nothing a browser understands about gets none.
 */
export function nativeChecks(fields: z.ZodObject) {
  const described = z.toJSONSchema(fields, { io: "input", unrepresentable: "any" }).properties;
  return (name: string): NativeChecks => {
    const field = described?.[name];
    if (field === undefined || isBoolean(field)) {
      return { maxLength: undefined, required: false };
    }
    return { maxLength: field.maxLength, required: (field.minLength ?? 0) > 0 };
  };
}

/**
 * Whether one of this site's own pages sent the request. Another site's
 * form can post here too, with the visitor's session.
 */
function isFromThisSite(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) {
    return site === "same-origin";
  }
  return request.headers.get("origin") === new URL(request.url).origin;
}

/** "See Other": the browser follows it with a GET, so a reload does not post again. */
function seeOther(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`A form post answers with a path on this site, not ${path}`);
  }
  return new Response(null, { headers: { Location: path }, status: 303 });
}

/**
 * Answers a form the browser posted by itself: runs the mutation, then
 * redirects to `landing`, or back to the form's failure notice.
 *
 * `answerFormPost` is this with the request's Convex client. Tests call it
 * with a form's real `FormData` and an in-memory backend.
 */
export async function formPostResponse<
  TMutation extends PublicMutation,
  TFields extends z.ZodObject,
  TCarried extends HiddenInputs,
>(
  post: FormPost<TMutation, TFields, TCarried>,
  input: {
    data: FormData;
    mutate: (args: FunctionArgs<TMutation>) => Promise<FunctionReturnType<TMutation>>;
    /** Told about a mutation that threw. The visitor only sees the notice. */
    report: (error: Error) => void;
    request: Request;
    t: TranslationFunction;
  },
) {
  if (!isFromThisSite(input.request)) {
    return new Response("Forbidden", { status: 403 });
  }
  const posted = Object.fromEntries(input.data);
  const carried = post.carried.safeParse(posted);
  if (!carried.success) {
    // Not a form this site rendered, so there is no page to go back to.
    return new Response("Bad Request", { status: 400 });
  }
  const failed = seeOther(`${post.page(carried.data)}#${formPostFailedId(post.id)}`);
  const fields = post.fields(input.t).safeParse(posted);
  if (!fields.success) {
    return failed;
  }
  try {
    const result = await input.mutate(
      post.args({ carried: carried.data, fields: fields.data, request: input.request }),
    );
    return seeOther(post.landing({ carried: carried.data, result }));
  } catch (error) {
    input.report(error instanceof Error ? error : new Error(String(error)));
    return failed;
  }
}
