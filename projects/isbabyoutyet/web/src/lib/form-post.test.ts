import { makeFunctionReference } from "convex/server";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { formPost, formPostResponse, nativeChecks } from "@/lib/form-post";
import type { TranslationFunction } from "@/lib/i18n";
import { translate } from "@/lib/i18n";

const t: TranslationFunction = (key, ...args) => translate("en-GB", key, ...args);

const addNote = makeFunctionReference<
  "mutation",
  { author: string; postedByBrowser: boolean; text: string },
  { noteId: string }
>("notes:add");

function noteFields(translation: TranslationFunction) {
  return z.object({ text: z.string().trim().min(1, translation("Message is required")).max(20) });
}

const notePost = formPost({
  args: (input) => ({
    author: input.carried.author,
    postedByBrowser: input.request !== null,
    text: input.fields.text,
  }),
  carried: z.object({ author: z.string().min(1) }),
  fields: noteFields,
  id: "note",
  landing: (input) => `/notes/${input.result.noteId}`,
  mutation: addNote,
  page: (carried) => `/authors/${carried.author}`,
});

function posted(entries: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

function browserPost(headers: HeadersInit) {
  return new Request("https://example.test/_serverFn/abc", { headers, method: "POST" });
}

const fromThisSite = { "sec-fetch-site": "same-origin" } satisfies HeadersInit;

/** Answers a post with a mutation that works, and keeps what it was called with. */
function answering(opts: { data: FormData; request: Request }) {
  const mutate = vi.fn(async () => ({ noteId: "n1" }));
  const response = formPostResponse(notePost, {
    data: opts.data,
    mutate,
    report: (error) => {
      throw error;
    },
    request: opts.request,
    t,
  });
  return [response, mutate] as const;
}

test("a posted form runs its mutation and lands on what it made", async () => {
  const [answer, mutate] = answering({
    data: posted({ author: "ada", text: "  hello  " }),
    request: browserPost(fromThisSite),
  });
  const response = await answer;

  expect(mutate).toHaveBeenCalledExactlyOnceWith({
    author: "ada",
    postedByBrowser: true,
    text: "hello",
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/notes/n1");
});

test("a post that fails the fields' checks goes back to the form's notice, unsent", async () => {
  const [answer, mutate] = answering({
    data: posted({ author: "ada", text: "   " }),
    request: browserPost(fromThisSite),
  });
  const response = await answer;

  expect(mutate).not.toHaveBeenCalled();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/authors/ada#note-failed");
});

test("a mutation that throws goes back to the notice and is reported", async () => {
  const refused = new Error("Not today");
  const report = vi.fn();
  const response = await formPostResponse(notePost, {
    data: posted({ author: "ada", text: "hello" }),
    mutate: async () => {
      throw refused;
    },
    report,
    request: browserPost(fromThisSite),
    t,
  });

  expect(report).toHaveBeenCalledExactlyOnceWith(refused);
  expect(response.headers.get("location")).toBe("/authors/ada#note-failed");
});

test("a landing off this site is reported, not followed", async () => {
  const report = vi.fn();
  const response = await formPostResponse(
    { ...notePost, landing: () => "//elsewhere.test/notes" },
    {
      data: posted({ author: "ada", text: "hello" }),
      mutate: async () => ({ noteId: "n1" }),
      report,
      request: browserPost(fromThisSite),
      t,
    },
  );

  expect(report).toHaveBeenCalledOnce();
  expect(response.headers.get("location")).toBe("/authors/ada#note-failed");
});

test("another site's form is refused before anything is read", async () => {
  const [answer, mutate] = answering({
    data: posted({ author: "ada", text: "hello" }),
    request: browserPost({ "sec-fetch-site": "cross-site" }),
  });
  const response = await answer;

  expect(response.status).toBe(403);
  expect(mutate).not.toHaveBeenCalled();
});

test("a browser that sends no Sec-Fetch-Site is judged by its Origin", async () => {
  const [own] = answering({
    data: posted({ author: "ada", text: "hello" }),
    request: browserPost({ origin: "https://example.test" }),
  });
  const [foreign, foreignMutate] = answering({
    data: posted({ author: "ada", text: "hello" }),
    request: browserPost({ origin: "https://elsewhere.test" }),
  });

  expect((await own).status).toBe(303);
  expect((await foreign).status).toBe(403);
  expect(foreignMutate).not.toHaveBeenCalled();
});

test("a post without what the page carries has no page to go back to", async () => {
  const [answer, mutate] = answering({
    data: posted({ text: "hello" }),
    request: browserPost(fromThisSite),
  });
  const response = await answer;

  expect(response.status).toBe(400);
  expect(mutate).not.toHaveBeenCalled();
});

test("the fields' schema says what the browser can check by itself", () => {
  const checks = nativeChecks(
    z.object({
      agreed: z.boolean(),
      name: z.string().trim().min(1).max(50),
      nickname: z.string(),
      photo: z.custom<File>().nullable(),
    }),
  );

  expect(checks("name")).toEqual({ maxLength: 50, required: true });
  expect(checks("nickname")).toEqual({ maxLength: undefined, required: false });
  expect(checks("agreed")).toEqual({ maxLength: undefined, required: false });
  expect(checks("photo")).toEqual({ maxLength: undefined, required: false });
  expect(checks("nowhere")).toEqual({ maxLength: undefined, required: false });
});
