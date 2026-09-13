/**
 * Email delivery port + adapters.
 *
 * Better Auth (and future transactional mail) depend on {@link EmailSender}
 * rather than Resend or `console` directly. Local backends always log;
 * Vercel production/preview send through Resend when configured.
 */

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/** Local Convex / tests when `EMAIL_FROM` is unset. Vercel always sets it. */
export const LOCAL_FROM_PLACEHOLDER = "noreply@localhost";

export const PRODUCTION_FROM_NAME = "Is Baby Out Yet?";
export const PREVIEW_FROM_NAME = "Is Baby Out Yet? (Preview)";
export const PREVIEW_SUBJECT_PREFIX = "[Preview] ";

export type EmailAddress = {
  readonly address: string;
  readonly name: string;
};

export type EmailMessage = {
  readonly from: EmailAddress;
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
};

export type EmailSender = {
  readonly kind: "log" | "resend";
  send(message: EmailMessage): Promise<void>;
};

export type EmailSenderEnv = {
  readonly EMAIL_FROM: string;
  readonly RESEND_API_KEY: string | undefined;
  readonly VERCEL_ENV: "production" | "preview" | undefined;
};

export type ResendEmailSenderOptions = {
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
};

export type ResolveEmailSenderOptions = {
  readonly env: EmailSenderEnv;
  readonly fetchImpl: typeof fetch;
  readonly log: (message: string, details: EmailMessage) => void;
};

export function createLogEmailSender(
  log: (message: string, details: EmailMessage) => void,
): EmailSender {
  return {
    kind: "log",
    async send(message) {
      log("email.skipped_local_delivery", message);
    },
  };
}

function formatResendFrom(from: EmailAddress) {
  return `${from.name} <${from.address}>`;
}

export function createResendEmailSender(opts: ResendEmailSenderOptions): EmailSender {
  return {
    kind: "resend",
    async send(message) {
      const response = await opts.fetchImpl(RESEND_EMAILS_URL, {
        body: JSON.stringify({
          from: formatResendFrom(message.from),
          html: message.html,
          subject: message.subject,
          text: message.text,
          to: [message.to],
        }),
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Resend rejected the message (${response.status})`);
      }
    },
  };
}

export function resolveEmailIdentity(env: EmailSenderEnv): EmailAddress & {
  readonly subjectPrefix: string;
} {
  if (env.VERCEL_ENV === "preview") {
    return {
      address: env.EMAIL_FROM,
      name: PREVIEW_FROM_NAME,
      subjectPrefix: PREVIEW_SUBJECT_PREFIX,
    };
  }

  return {
    address: env.EMAIL_FROM,
    name: PRODUCTION_FROM_NAME,
    subjectPrefix: "",
  };
}

/**
 * Local Convex backends always log. Production and preview send through
 * Resend when `RESEND_API_KEY` is present; otherwise the sender throws a
 * clear setup error when `send` is called.
 */
export function resolveEmailSender(opts: ResolveEmailSenderOptions): EmailSender {
  const vercelEnv = opts.env.VERCEL_ENV;
  if (vercelEnv !== "production" && vercelEnv !== "preview") {
    return createLogEmailSender(opts.log);
  }

  const apiKey = opts.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      kind: "resend",
      async send() {
        throw new Error(
          "Resend is not configured (set RESEND_API_KEY on Vercel Preview/Production).",
        );
      },
    };
  }

  return createResendEmailSender({
    apiKey,
    fetchImpl: opts.fetchImpl,
  });
}

const HTTP_URL_IN_TEXT = /https?:\/\/[^\s<>"']+/g;

/**
 * Pulls http(s) callback URLs out of plaintext so local backends can log
 * them on their own lines (terminals treat a lone URL as clickable).
 */
export function callbackUrlsFromEmailText(text: string) {
  const found = text.match(HTTP_URL_IN_TEXT);
  if (found === null) {
    return [];
  }
  return found.map((url) => url.replace(/[),.;]+$/u, ""));
}

export function defaultEmailLog(message: string, details: EmailMessage) {
  console.log(message, {
    from: details.from,
    subject: details.subject,
    text: details.text,
    to: details.to,
  });
  for (const url of callbackUrlsFromEmailText(details.text)) {
    console.log(url);
  }
}
