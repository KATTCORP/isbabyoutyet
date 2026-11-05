import { isPlainObject, isString } from "@workspace/runtime/guards";
import { expect, test } from "vitest";
import { captureException } from "./capture.js";

const dsn = "https://public-key@example.test/123";

function fakeFetch() {
  const calls: Array<{ body: string; url: string }> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const body = init?.body;
    calls.push({
      body: isString(body) ? body : "",
      url: isString(input) ? input : "",
    });
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  return { calls, fetchImpl };
}

function frameFilenames(body: string) {
  const eventLine = body.split("\n")[2];
  if (eventLine === undefined) {
    return [];
  }
  const parsed: unknown = JSON.parse(eventLine);
  if (!isPlainObject(parsed) || !isPlainObject(parsed.exception)) {
    return [];
  }
  const values = parsed.exception.values;
  if (!Array.isArray(values)) {
    return [];
  }
  const first = values[0];
  if (!isPlainObject(first) || !isPlainObject(first.stacktrace)) {
    return [];
  }
  const frames = first.stacktrace.frames;
  if (!Array.isArray(frames)) {
    return [];
  }
  const filenames: Array<string> = [];
  for (const frame of frames) {
    if (isPlainObject(frame) && isString(frame.filename)) {
      filenames.push(frame.filename);
    }
  }
  return filenames;
}

test("posts an exception envelope and keeps the oldest stack frame first", async () => {
  const recorded = fakeFetch();
  const cause = new Error("render failed");
  cause.stack = [
    "Error: render failed",
    "    at renderPasswordResetEmail (projects/isbabyoutyet/email/src/render.ts:10:4)",
    "    at sendPasswordResetEmail (projects/isbabyoutyet/backend/convex/authEmail.ts:20:8)",
  ].join("\n");

  await captureException({
    cause,
    dsn,
    environment: "preview",
    fetchImpl: recorded.fetchImpl,
    release: "abc123",
    runtime: "email",
  });

  const call = recorded.calls[0];
  expect(call?.url).toBe("https://example.test/api/123/envelope/");
  expect(call?.body).toContain("render failed");
  expect(call?.body).toContain('"runtime":"email"');
  expect(call?.body).toContain('"release":"abc123"');
  expect(frameFilenames(call?.body ?? "")).toEqual([
    "projects/isbabyoutyet/backend/convex/authEmail.ts",
    "projects/isbabyoutyet/email/src/render.ts",
  ]);
});

test("does not call fetch without a DSN or when the DSN cannot be parsed", async () => {
  const recorded = fakeFetch();
  await captureException({
    cause: new Error("nope"),
    dsn: null,
    environment: "development",
    fetchImpl: recorded.fetchImpl,
    release: null,
    runtime: "convex",
  });
  await captureException({
    cause: new Error("nope"),
    dsn: "not a url",
    environment: "development",
    fetchImpl: recorded.fetchImpl,
    release: null,
    runtime: "convex",
  });
  expect(recorded.calls).toEqual([]);
});

test("swallows a failed request", async () => {
  const fetchImpl: typeof fetch = () => Promise.reject(new Error("offline"));
  await expect(
    captureException({
      cause: "not-an-error",
      dsn,
      environment: "production",
      fetchImpl,
      release: null,
      runtime: "convex",
    }),
  ).resolves.toBeUndefined();
});
