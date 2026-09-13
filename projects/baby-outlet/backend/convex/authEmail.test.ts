import { expect, test, vi } from "vitest";
import { makeResource } from "./test.resource";
import { sendPasswordResetEmail } from "./authEmail";
import {
  LOCAL_FROM_PLACEHOLDER,
  PREVIEW_SUBJECT_PREFIX,
  PRODUCTION_FROM_NAME,
  createLogEmailSender,
  defaultEmailLog,
  resolveEmailIdentity,
  resolveEmailSender,
  type EmailSenderEnv,
} from "./emailSender";

const PRODUCTION_FROM = "noreply@isbabyoutyet.com";
const PREVIEW_FROM = "preview@isbabyoutyet.com";

function configuredEnv(overrides: Partial<EmailSenderEnv> = {}): EmailSenderEnv {
  return {
    EMAIL_FROM: PRODUCTION_FROM,
    RESEND_API_KEY: "re_test_key",
    VERCEL_ENV: "production",
    ...overrides,
  };
}

test("preview identity uses EMAIL_FROM and a subject prefix", () => {
  expect(
    resolveEmailIdentity(configuredEnv({ EMAIL_FROM: PREVIEW_FROM, VERCEL_ENV: "preview" })),
  ).toEqual({
    address: PREVIEW_FROM,
    name: "Is Baby Out Yet? (Preview)",
    subjectPrefix: PREVIEW_SUBJECT_PREFIX,
  });
});

test("production identity uses EMAIL_FROM", () => {
  expect(resolveEmailIdentity(configuredEnv())).toEqual({
    address: PRODUCTION_FROM,
    name: PRODUCTION_FROM_NAME,
    subjectPrefix: "",
  });
});

test("local backends resolve to the log sender", () => {
  const sender = resolveEmailSender({
    env: configuredEnv({ VERCEL_ENV: undefined }),
    fetchImpl: vi.fn<typeof fetch>(),
    log: vi.fn(),
  });
  expect(sender.kind).toBe("log");
});

test("sends password reset email through Resend", async () => {
  await using _cleanup = makeResource({}, () => {
    vi.unstubAllGlobals();
  });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await sendPasswordResetEmail({
    deps: {
      env: configuredEnv(),
      fetchImpl: fetchMock,
      log: vi.fn(),
      sender: null,
    },
    recipient: "parent@example.com",
    resetUrl: "https://isbabyoutyet.com/auth/reset-password?token=secret",
  });

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init?.headers).toEqual({
    Authorization: "Bearer re_test_key",
    "Content-Type": "application/json",
  });
  expect(JSON.parse(String(init?.body))).toMatchObject({
    from: "Is Baby Out Yet? <noreply@isbabyoutyet.com>",
    subject: "Reset your Is Baby Out Yet? password",
    to: ["parent@example.com"],
  });
});

test("preview sends with prefixed subject and that environment's EMAIL_FROM", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

  await sendPasswordResetEmail({
    deps: {
      env: configuredEnv({ EMAIL_FROM: PREVIEW_FROM, VERCEL_ENV: "preview" }),
      fetchImpl: fetchMock,
      log: vi.fn(),
      sender: null,
    },
    recipient: "parent@example.com",
    resetUrl: "https://preview.example/auth/reset-password?token=secret",
  });

  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    from: "Is Baby Out Yet? (Preview) <preview@isbabyoutyet.com>",
    subject: "[Preview] Reset your Is Baby Out Yet? password",
  });
});

test("fails when Resend rejects the email", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));

  await expect(
    sendPasswordResetEmail({
      deps: {
        env: configuredEnv(),
        fetchImpl: fetchMock,
        log: vi.fn(),
        sender: null,
      },
      recipient: "parent@example.com",
      resetUrl: "https://isbabyoutyet.com/auth/reset-password?token=secret",
    }),
  ).rejects.toThrow("Resend rejected the message (403)");
});

test("fails clearly when RESEND_API_KEY is missing on Vercel", async () => {
  const fetchMock = vi.fn<typeof fetch>();

  await expect(
    sendPasswordResetEmail({
      deps: {
        env: configuredEnv({ RESEND_API_KEY: undefined }),
        fetchImpl: fetchMock,
        log: vi.fn(),
        sender: null,
      },
      recipient: "parent@example.com",
      resetUrl: "https://isbabyoutyet.com/auth/reset-password?token=secret",
    }),
  ).rejects.toThrow("Resend is not configured");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("local delivery logs instead of calling Resend", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  const log = vi.fn();

  await sendPasswordResetEmail({
    deps: {
      env: configuredEnv({ VERCEL_ENV: undefined }),
      fetchImpl: fetchMock,
      log,
      sender: createLogEmailSender(log),
    },
    recipient: "parent@example.com",
    resetUrl: "http://localhost:3000/auth/reset-password?token=secret",
  });

  expect(fetchMock).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(
    "email.skipped_local_delivery",
    expect.objectContaining({
      subject: "Reset your Is Baby Out Yet? password",
      to: "parent@example.com",
    }),
  );
});

test("defaultEmailLog writes a structured console line", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await using _restore = makeResource({}, () => {
    log.mockRestore();
  });

  defaultEmailLog("email.skipped_local_delivery", {
    from: { address: LOCAL_FROM_PLACEHOLDER, name: PRODUCTION_FROM_NAME },
    html: "<p>Reset</p>",
    subject: "Reset your Is Baby Out Yet? password",
    text: "Reset your password: http://localhost:3000/auth/reset-password?token=secret",
    to: "parent@example.com",
  });

  expect(log).toHaveBeenCalledWith(
    "email.skipped_local_delivery",
    expect.objectContaining({
      subject: "Reset your Is Baby Out Yet? password",
      to: "parent@example.com",
    }),
  );
  expect(log).toHaveBeenCalledWith("http://localhost:3000/auth/reset-password?token=secret");
});

test("omitted deps read Convex env and log on local backends", async () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  await using _env = makeResource({}, () => {
    if (previousVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = previousVercelEnv;
    }
  });
  delete process.env.VERCEL_ENV;

  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await using _restore = makeResource({}, () => {
    log.mockRestore();
  });

  await sendPasswordResetEmail({
    deps: null,
    recipient: "parent@example.com",
    resetUrl: "http://localhost:3000/auth/reset-password?token=secret",
  });

  expect(log).toHaveBeenCalledWith(
    "email.skipped_local_delivery",
    expect.objectContaining({
      to: "parent@example.com",
    }),
  );
  expect(log).toHaveBeenCalledWith("http://localhost:3000/auth/reset-password?token=secret");
});
