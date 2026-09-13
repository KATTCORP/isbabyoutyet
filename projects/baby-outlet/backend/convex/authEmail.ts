import { renderPasswordResetEmail } from "@workspace/email";
import type { RenderedEmail } from "@workspace/email";
import {
  LOCAL_FROM_PLACEHOLDER,
  defaultEmailLog,
  resolveEmailIdentity,
  resolveEmailSender,
  type EmailSender,
  type EmailSenderEnv,
} from "./emailSender";
import { env } from "./_generated/server";

export type EmailDeliveryDeps = {
  readonly env: EmailSenderEnv;
  readonly fetchImpl: typeof fetch;
  readonly log: typeof defaultEmailLog;
  /** When null, resolve from env (log locally, Resend on Vercel). */
  readonly sender: EmailSender | null;
};

/** @deprecated Use {@link EmailDeliveryDeps}. */
export type PasswordResetEmailDeps = EmailDeliveryDeps;

async function sendRenderedEmail(opts: {
  deps: EmailDeliveryDeps | null;
  recipient: string;
  rendered: RenderedEmail;
}) {
  const deps = opts.deps ?? defaultEmailDeliveryDeps();
  const identity = resolveEmailIdentity(deps.env);
  const sender =
    deps.sender ??
    resolveEmailSender({
      env: deps.env,
      fetchImpl: deps.fetchImpl,
      log: deps.log,
    });

  await sender.send({
    from: {
      address: identity.address,
      name: identity.name,
    },
    html: opts.rendered.html,
    subject: opts.rendered.subject,
    text: opts.rendered.text,
    to: opts.recipient,
  });
}

/**
 * Build the password-reset template and deliver it through the resolved
 * {@link EmailSender}. Production passes `deps: null`; tests inject env /
 * fetch / sender.
 */
export async function sendPasswordResetEmail(opts: {
  deps: EmailDeliveryDeps | null;
  recipient: string;
  resetUrl: string;
}) {
  const deps = opts.deps ?? defaultEmailDeliveryDeps();
  const identity = resolveEmailIdentity(deps.env);
  await sendRenderedEmail({
    deps,
    recipient: opts.recipient,
    rendered: await renderPasswordResetEmail({
      resetUrl: opts.resetUrl,
      subjectPrefix: identity.subjectPrefix,
    }),
  });
}

function defaultEmailDeliveryDeps(): EmailDeliveryDeps {
  return {
    env: {
      EMAIL_FROM: env.EMAIL_FROM ?? LOCAL_FROM_PLACEHOLDER,
      RESEND_API_KEY: env.RESEND_API_KEY,
      VERCEL_ENV: env.VERCEL_ENV,
    },
    fetchImpl: fetch,
    log: defaultEmailLog,
    sender: null,
  };
}
