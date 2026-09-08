import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { requestPasswordResetThenGo } from "@/lib/auth-client";
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
import { BabyIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import type { TranslationFunction } from "@/lib/i18n";
import { translate, useI18n } from "@/lib/i18n";
import { robotsNoIndexMeta } from "@/lib/seo";
import { authPageCacheHeaders } from "@/lib/cachePolicy";

function forgotPasswordSchema(t: TranslationFunction) {
  return z.object({
    email: z
      .string()
      .trim()
      .check(z.email(t("Invalid email address"))),
  });
}

type ForgotPasswordRequest = { email: string };

export const Route = createFileRoute("/auth/forgot-password")({
  component: ForgotPasswordPage,
  validateSearch: z.object({
    // TanStack JSON-parses `?sent=1` as a number; keep the success flag
    // after a cold load of the same URL the form navigates to.
    sent: z
      .union([z.literal("1"), z.literal(1)])
      .optional()
      .transform((value) => (value === undefined ? undefined : ("1" as const))),
  }),
  headers: authPageCacheHeaders,
  head: (opts) => ({
    meta: [
      {
        title: translate(opts.match.context.locale, "Reset your password – Is Baby Out Yet?"),
      },
      ...robotsNoIndexMeta(),
    ],
  }),
});

/**
 * @internal Exported for smoke tests; production mounts it via `Route`.
 */
export function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  return (
    <ForgotPasswordCard
      onRequestReset={(values) =>
        requestPasswordResetThenGo(values, {
          navigate: () =>
            navigate({
              replace: true,
              search: { sent: "1" },
              to: "/auth/forgot-password",
            }),
          t,
        })
      }
      sent={search.sent === "1"}
    />
  );
}

/**
 * Forgot-password form. Takes the request flow as a prop so tests can render
 * it without an auth client. Success is URL-driven (`?sent=1`) — no local state.
 *
 * @internal Exported for tests; production uses `ForgotPasswordPage`.
 */
export function ForgotPasswordCard(props: {
  onRequestReset: (values: ForgotPasswordRequest) => Promise<void>;
  sent: boolean;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {
      email: "",
    },
    schema: forgotPasswordSchema(t),
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
              ✉️
            </p>
            <CardTitle className="text-2xl font-black">{t("Reset your password")}</CardTitle>
            <CardDescription className="font-medium">
              {props.sent
                ? t("Check your inbox for the next step.")
                : t("Enter your email and we'll send you a secure reset link.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {props.sent ? (
              <div className="space-y-5 text-sm text-muted-foreground">
                <p>
                  {t(
                    "If an account exists for that address, a password reset email is on its way.",
                  )}
                </p>
                <Link
                  className="inline-flex w-full items-center justify-center rounded-full border-2 border-border bg-background px-4 py-2.5 text-sm font-extrabold text-foreground pop-shadow transition-transform hover:-rotate-1"
                  to="/auth/login"
                >
                  {t("Back to sign in")}
                </Link>
              </div>
            ) : (
              <>
                <Form form={form} handleSubmit={(values) => props.onRequestReset(values)}>
                  <div className="space-y-5">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("Email")}</FormLabel>
                          <FormControl>
                            <Input
                              autoComplete="email"
                              placeholder={t("you@example.com")}
                              type="email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <SubmitButton
                      className="w-full rounded-full font-extrabold pop-shadow"
                      form="context"
                      IconComponent={EnvelopeSimpleIcon}
                      iconPosition="start"
                      size="lg"
                    >
                      {t("Send reset link")}
                    </SubmitButton>
                  </div>
                </Form>
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  <Link
                    className="text-primary hover:text-primary/80 font-medium underline underline-offset-4"
                    to="/auth/login"
                  >
                    {t("Back to sign in")}
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
