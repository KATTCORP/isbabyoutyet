import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { z } from "zod";
import { signInThenGo } from "@/lib/auth-client";
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
import { BabyIcon, SignInIcon } from "@phosphor-icons/react";
import { DEMO_USER } from "@workspace/convex/src/seedCredentials";
import { DemoAccountPicker } from "@/components/demo-account-picker";
import { hasDemoLogin } from "@/lib/has-demo-login";
import type { TranslationFunction } from "@/lib/i18n";
import { translate, useI18n } from "@/lib/i18n";
import { robotsNoIndexMeta } from "@/lib/seo";
import { authPageCacheHeaders } from "@/lib/cachePolicy";
import { babyLoginHomeLink, loginSuccessTarget } from "@/lib/baby-login-redirect";

function loginSchema(t: TranslationFunction) {
  return z.object({
    email: z
      .string()
      .trim()
      .check(z.email(t("Invalid email address"))),
    password: z.string().min(6, t("Password must be at least 6 characters")),
  });
}

type Credentials = { email: string; password: string };

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  headers: authPageCacheHeaders,
  head: (opts) => ({
    meta: [
      {
        title: translate(opts.match.context.locale, "Log in – Is Baby Out Yet?"),
      },
      ...robotsNoIndexMeta(),
    ],
  }),
});

/**
 * @internal Exported for smoke tests; production mounts it via `Route`.
 */
export function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const search = Route.useSearch();
  const redirect = search.redirect;
  const homeLink = babyLoginHomeLink(redirect);
  const successTarget = loginSuccessTarget(redirect);
  const context = Route.useRouteContext();

  return (
    <div className="min-h-screen bg-background bg-dots flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          {...homeLink}
          className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 shadow-sm transition-transform hover:-rotate-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <BabyIcon className="h-4 w-4 text-primary" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
        </Link>
        <Card className="rounded-[2rem] border-2 pop-shadow-strong">
          <LoginCard
            demoLoginEnabled={hasDemoLogin}
            onSignIn={(values) =>
              signInThenGo(values, {
                convexClient: context.convexClient,
                convexQueryClient: context.convexQueryClient,
                navigate: () => router.navigate(successTarget),
                queryClient: context.queryClient,
                t,
              })
            }
            signUpLink={{ to: "/auth/signup" }}
          />
        </Card>
      </div>
    </div>
  );
}

/**
 * Login form and its demo-account prefill. Callers wrap it in page or dialog
 * chrome.
 *
 * @internal Exported for tests; production uses `LoginPage`.
 */
export function LoginCard(props: {
  demoLoginEnabled: boolean;
  onSignIn: (values: Credentials) => Promise<void>;
  signUpLink: LinkProps;
}) {
  const { t } = useI18n();

  const form = useZodForm({
    defaultValues: props.demoLoginEnabled
      ? {
          email: DEMO_USER.email,
          password: DEMO_USER.password,
        }
      : {
          email: "",
          password: "",
        },
    schema: loginSchema(t),
  });

  return (
    <>
      <CardHeader className="text-center">
        <p aria-hidden="true" className="text-4xl">
          👋
        </p>
        <CardTitle className="text-2xl font-black">{t("Welcome back!")}</CardTitle>
        <CardDescription className="font-medium">
          {t("Sign in to keep everyone in the loop")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DemoAccountPicker
          enabled={props.demoLoginEnabled}
          onPrefill={(account) => {
            form.setValue("email", account.email);
            form.setValue("password", account.password);
            form.formRef.current?.requestSubmit();
          }}
        />
        <Form form={form} handleSubmit={(values) => props.onSignIn(values)}>
          <div className="space-y-5">
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
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>{t("Password")}</FormLabel>
                    <Link
                      className="text-xs font-semibold text-primary hover:text-primary/80 underline underline-offset-4"
                      to="/auth/forgot-password"
                    >
                      {t("Forgot your password?")}
                    </Link>
                  </div>
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
              IconComponent={SignInIcon}
              iconPosition="start"
              size="lg"
            >
              {t("Sign In")}
            </SubmitButton>
          </div>
        </Form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {t("Don't have an account?")}{" "}
          <Link
            {...props.signUpLink}
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-4"
          >
            {t("Sign up")}
          </Link>
        </div>
      </CardContent>
    </>
  );
}
