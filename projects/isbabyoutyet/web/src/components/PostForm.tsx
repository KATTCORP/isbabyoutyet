/**
 * The browser's half of a {@link FormPost}: the form's state, its Convex
 * mutation, and the `<form>` that the browser can also post by itself.
 */
import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { DefaultValues, FieldValues } from "react-hook-form";
import type { z } from "zod";
import { FormShell, useZodForm } from "@/components/Form";
import type { UseZodForm } from "@/components/Form";
import { formPostFailedId, nativeChecks } from "@/lib/form-post";
import type { FormPost, HiddenInputs, NativeChecks } from "@/lib/form-post";
import { useI18n } from "@/lib/i18n";
import { rememberInBrowser } from "@/lib/remembered";
import { useHydrated } from "@/lib/use-hydrated";
import { useRestoredFields } from "@/lib/use-restored-fields";

type PublicMutation = FunctionReference<"mutation", "public">;

/** What {@link PostForm} renders a `<form>` from. */
type PostFormWiring<TInput extends FieldValues, TMutation extends PublicMutation> = {
  action: { url: string };
  carried: HiddenInputs;
  form: UseZodForm<TInput, unknown, FunctionArgs<TMutation>>;
  id: string;
};

type UseFormPost<TMutation extends PublicMutation, TFields extends z.ZodObject> = PostFormWiring<
  z.input<TFields>,
  TMutation
> & {
  /** Spread onto a field's input: the browser's own checks, from the schema. */
  native: (name: keyof z.input<TFields> & string) => NativeChecks;
  /**
   * Calls the form's mutation over the Convex client, then has the browser
   * keep what the form remembers.
   */
  send: (args: FunctionArgs<TMutation>) => Promise<FunctionReturnType<TMutation>>;
};

/**
 * With JS, the form checks `post.fields` as the visitor types and `send`
 * calls `post.mutation` over the Convex client, with the arguments
 * `post.args` builds. Render it with {@link PostForm}.
 */
export function useFormPost<
  TMutation extends PublicMutation,
  TFields extends z.ZodObject,
  TCarried extends HiddenInputs,
>(
  post: FormPost<TMutation, TFields, TCarried>,
  opts: {
    /** The form's server function, declared beside `post`. */
    action: { url: string };
    carried: TCarried;
    /** What the server knows the fields start as. It is in the page's HTML. */
    defaultValues: DefaultValues<z.input<TFields>>;
    /**
     * What only the browser knows they should start as, read once the
     * page's JS runs. `null` for a form with nothing to restore.
     */
    restore: (() => DefaultValues<z.input<TFields>>) | null;
  },
): UseFormPost<TMutation, TFields> {
  const { t } = useI18n();
  const fields = post.fields(t);
  const form = useZodForm({
    defaultValues: opts.defaultValues,
    schema: fields.transform((typed) =>
      post.args({ carried: opts.carried, fields: typed, request: null }),
    ),
  });
  useRestoredFields({
    formRef: form.formRef,
    getValues: form.getValues,
    read: opts.restore,
    reset: form.reset,
  });
  const mutate = useMutation(post.mutation);
  return {
    action: opts.action,
    carried: opts.carried,
    form,
    id: post.id,
    native: nativeChecks(fields),
    send: async (args) => {
      const result = await mutate(args);
      rememberInBrowser(post.remembers(args));
      return result;
    },
  };
}

/**
 * The `<form>` of a {@link useFormPost}. Until the page's JS runs, the
 * browser posts it to the form's server function and checks the fields
 * itself. After that, `handleSubmit` gets the mutation's arguments.
 */
export function PostForm<TInput extends FieldValues, TMutation extends PublicMutation>(props: {
  children: ReactNode;
  /** Shown above the fields after a post without JS failed. */
  failedMessage: string;
  handleSubmit: (args: FunctionArgs<TMutation>) => Promise<void>;
  post: PostFormWiring<TInput, TMutation>;
}) {
  const hydrated = useHydrated();
  return (
    <FormShell
      form={props.post.form}
      handleSubmit={props.handleSubmit}
      // Once hydrated, the schema's messages replace the browser's own.
      native={{ action: props.post.action.url, noValidate: hydrated }}
    >
      <p
        className="mb-3 hidden scroll-mt-24 text-center text-sm font-medium text-destructive target:block"
        id={formPostFailedId(props.post.id)}
        role="alert"
      >
        {props.failedMessage}
      </p>
      {Object.entries(props.post.carried).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      {props.children}
    </FormShell>
  );
}
