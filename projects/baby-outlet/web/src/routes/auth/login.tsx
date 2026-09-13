import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
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
import { Form, useZodForm } from "@/components/Form";
import { Baby } from "@phosphor-icons/react";
import { DEMO_USER } from "@baby-outlet/backend/src/seedCredentials";
import { DemoAccountPicker } from "@/components/demo-account-picker";
import { hasDemoLogin } from "@/lib/has-demo-login";
import type { TranslationFunction } from "@/lib/i18n";
import { translate, useI18n } from "@/lib/i18n";
import { robotsNoIndexMeta } from "@/lib/seo";

function loginSchema(t: TranslationFunction) {
  return z.object({
    email: z.string().email(t("Invalid email address")),
    password: z.string().min(6, t("Password must be at least 6 characters")),
  });
}

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
  head: (opts) => ({
    meta: [
      {
        title: translate(opts.match.context.locale, "Log in – Is Baby Out Yet?"),
      },
      ...robotsNoIndexMeta(),
    ],
  }),
});

function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();

  const form = useZodForm({
    schema: loginSchema(t),
    defaultValues: hasDemoLogin
      ? {
          email: DEMO_USER.email,
          password: DEMO_USER.password,
        }
      : {
          email: "",
          password: "",
        },
  });

  return (
    <div className="min-h-screen bg-background bg-dots flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 shadow-sm transition-transform hover:-rotate-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <Baby className="h-4 w-4 text-primary" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
        </Link>
        <Card className="rounded-[2rem] border-2 pop-shadow-strong">
          <CardHeader className="text-center">
            <p className="text-4xl" aria-hidden="true">
              👋
            </p>
            <CardTitle className="text-2xl font-black">{t("Welcome back!")}</CardTitle>
            <CardDescription className="font-medium">
              {t("Sign in to keep everyone in the loop")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DemoAccountPicker
              onPrefill={(account) => {
                form.setValue("email", account.email);
                form.setValue("password", account.password);
                form.formRef.current?.requestSubmit();
              }}
            />
            <Form
              form={form}
              handleSubmit={async (values) => {
                const result = await authClient.signIn.email({
                  email: values.email,
                  password: values.password,
                  rememberMe: true,
                });

                if (result.error) {
                  throw new Error(result.error.message || t("Failed to sign in"));
                }

                await router.navigate({ to: "/dashboard" });
              }}
            >
              <div className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("Email")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
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

                <Button
                  type="submit"
                  className="w-full rounded-full font-extrabold pop-shadow"
                  disabled={form.formState.isSubmitting}
                  size="lg"
                >
                  {form.formState.isSubmitting ? t("Signing in...") : t("Sign In")}
                </Button>
              </div>
            </Form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {t("Don't have an account?")}{" "}
              <Link
                to="/auth/signup"
                className="text-primary hover:text-primary/80 font-medium underline underline-offset-4"
              >
                {t("Sign up")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
