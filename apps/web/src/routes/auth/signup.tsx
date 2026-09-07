import { createFileRoute, Link, useRouteContext, useRouter } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { z } from "zod";
import { signUpThenGo } from "@/lib/auth-client";
import { Input } from "@workspace/ui/components/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Form, SubmitButton, useZodForm } from "@/components/Form";
import { BabyIcon, UserPlusIcon } from "@phosphor-icons/react";
import type { TranslationFunction } from "@/lib/i18n";
import { translate, useI18n } from "@/lib/i18n";
import { robotsNoIndexMeta } from "@/lib/seo";
import { authPageCacheHeaders } from "@/lib/cachePolicy";

function signupSchema(t: TranslationFunction) {
  return z.object({
    email: z
      .string()
      .trim()
      .check(z.email(t("Invalid email address"))),
    name: z.string().min(2, t("Name must be at least 2 characters")),
    password: z.string().min(6, t("Password must be at least 6 characters")),
  });
}

export const Route = createFileRoute("/auth/signup")({
  component: SignupPage,
  headers: authPageCacheHeaders,
  head: (opts) => ({
    meta: [
      {
        title: translate(opts.match.context.locale, "Sign up – Is Baby Out Yet?"),
      },
      ...robotsNoIndexMeta(),
    ],
  }),
});

function SignupPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background bg-dots flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 shadow-sm transition-transform hover:-rotate-2"
          to="/"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <BabyIcon className="h-4 w-4 text-primary" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
        </Link>
        <Card className="rounded-[2rem] border-2 pop-shadow-strong">
          <SignupCard
            navigate={() => router.navigate({ to: "/dashboard" })}
            signInLink={{ to: "/auth/login" }}
          />
        </Card>
      </div>
    </div>
  );
}

/**
 * Signup form, creating the account through the real auth client. Callers
 * wrap it in page or dialog chrome and own the destination (`navigate` runs
 * once Convex sees the new user).
 *
 * Shared by `/auth/signup` and the baby-page signup overlay.
 */
export function SignupCard(props: { navigate: () => Promise<void> | void; signInLink: LinkProps }) {
  const { t } = useI18n();
  const context = useRouteContext({ from: "__root__" });

  const form = useZodForm({
    defaultValues: {
      email: "",
      name: "",
      password: "",
    },
    schema: signupSchema(t),
  });

  return (
    <>
      <CardHeader className="text-center">
        <p aria-hidden="true" className="text-4xl">
          🎈
        </p>
        <CardTitle className="text-2xl font-black">{t("Join the fun!")}</CardTitle>
        <CardDescription className="font-medium">
          {t("Create an account to share your baby's arrival")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form
          form={form}
          handleSubmit={(values) =>
            signUpThenGo(values, {
              convexClient: context.convexClient,
              convexQueryClient: context.convexQueryClient,
              navigate: props.navigate,
              queryClient: context.queryClient,
              t,
            })
          }
        >
          <div className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("Your name")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Email")}</FormLabel>
                  <FormControl>
                    <Input placeholder="you@example.com" type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Password")}</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SubmitButton
              className="w-full rounded-full font-extrabold pop-shadow"
              form="context"
              IconComponent={UserPlusIcon}
              iconPosition="start"
              size="lg"
            >
              {t("Sign Up")}
            </SubmitButton>
          </div>
        </Form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("Already have an account?")}{" "}
          <Link
            {...props.signInLink}
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-4"
          >
            {t("Sign in")}
          </Link>
        </div>
      </CardContent>
    </>
  );
}
