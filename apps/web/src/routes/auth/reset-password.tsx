import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { resetPasswordThenGo } from "@/lib/auth-client";
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
import { BabyIcon, KeyIcon } from "@phosphor-icons/react";
import type { TranslationFunction } from "@/lib/i18n";
import { translate, useI18n } from "@/lib/i18n";
import { robotsNoIndexMeta } from "@/lib/seo";
import { authPageCacheHeaders } from "@/lib/cachePolicy";

const searchSchema = z.object({
  error: z.string().optional(),
  token: z.string().optional(),
});

function resetPasswordSchema(t: TranslationFunction) {
  return z
    .object({
      confirmPassword: z.string(),
      password: z.string().min(8, t("Password must be at least 8 characters")),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: t("Passwords do not match"),
      path: ["confirmPassword"],
    });
}

export const Route = createFileRoute("/auth/reset-password")({
  component: ResetPasswordPage,
  validateSearch: searchSchema,
  headers: authPageCacheHeaders,
  head: (opts) => ({
    meta: [
      {
        title: translate(opts.match.context.locale, "Choose a new password – Is Baby Out Yet?"),
      },
      ...robotsNoIndexMeta(),
    ],
  }),
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const search = Route.useSearch();
  const token = search.token;
  const invalidLink = !token || search.error === "INVALID_TOKEN";
  const form = useZodForm({
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
    schema: resetPasswordSchema(t),
  });

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
          <CardHeader className="text-center">
            <p aria-hidden="true" className="text-4xl">
              🔑
            </p>
            <CardTitle className="text-2xl font-black">{t("Choose a new password")}</CardTitle>
            <CardDescription className="font-medium">
              {invalidLink
                ? t("This reset link is invalid or has expired.")
                : t("Use at least eight characters for your new password.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invalidLink || token === undefined ? (
              <Link
                className="inline-flex w-full items-center justify-center rounded-full border-2 border-border bg-background px-4 py-2.5 text-sm font-extrabold text-foreground pop-shadow transition-transform hover:-rotate-1"
                to="/auth/forgot-password"
              >
                {t("Request another link")}
              </Link>
            ) : (
              <Form
                form={form}
                handleSubmit={(values) =>
                  resetPasswordThenGo(
                    { newPassword: values.password, token },
                    {
                      navigate: () => router.navigate({ to: "/auth/login" }),
                      t,
                    },
                  )
                }
              >
                <div className="space-y-5">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("New password")}</FormLabel>
                        <FormControl>
                          <Input autoComplete="new-password" type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("Confirm new password")}</FormLabel>
                        <FormControl>
                          <Input autoComplete="new-password" type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <SubmitButton
                    className="w-full rounded-full font-extrabold pop-shadow"
                    form="context"
                    IconComponent={KeyIcon}
                    iconPosition="start"
                    size="lg"
                  >
                    {t("Update password")}
                  </SubmitButton>
                </div>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
