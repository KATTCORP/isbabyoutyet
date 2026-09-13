import { expect, test, vi } from "vitest";
import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { makeResource } from "@isbabyoutyet/backend/convex/test.resource";
import {
  clearEncouragementMessageDraft,
  readEncouragementFormDraft,
  writeEncouragementFormDraft,
} from "@/lib/encouragement-message-draft";

// SAFETY: Seeded convex-test document id.
const babyId = "baby_test_1" as Id<"baby">;
// SAFETY: Seeded convex-test document id.
const babyA = "baby_a" as Id<"baby">;
// SAFETY: Seeded convex-test document id.
const babyB = "baby_b" as Id<"baby">;

function sessionStorageResource() {
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  return makeResource(store, () => {
    vi.unstubAllGlobals();
  });
}

test("drafts are isolated per baby", async () => {
  await using _storage = sessionStorageResource();
  writeEncouragementFormDraft(babyA, { authorName: "", message: "For A" });
  writeEncouragementFormDraft(babyB, { authorName: "", message: "For B" });
  expect(readEncouragementFormDraft(babyA).message).toBe("For A");
  expect(readEncouragementFormDraft(babyB).message).toBe("For B");
});

test("write and read round-trip a form draft", async () => {
  await using _storage = sessionStorageResource();
  writeEncouragementFormDraft(babyId, {
    authorName: "Grandma",
    message: "Thinking of you all!",
  });
  expect(readEncouragementFormDraft(babyId)).toEqual({
    authorName: "Grandma",
    hasDraft: true,
    message: "Thinking of you all!",
  });
});

test("partial message updates preserve an existing author name draft", async () => {
  await using _storage = sessionStorageResource();
  writeEncouragementFormDraft(babyId, { authorName: "Grandma", message: "First" });
  writeEncouragementFormDraft(babyId, { authorName: "Grandma", message: "Updated" });
  expect(readEncouragementFormDraft(babyId)).toEqual({
    authorName: "Grandma",
    hasDraft: true,
    message: "Updated",
  });
});

test("whitespace-only drafts are not stored", async () => {
  await using _storage = sessionStorageResource();
  writeEncouragementFormDraft(babyId, { authorName: "   ", message: "   " });
  expect(readEncouragementFormDraft(babyId)).toEqual({
    authorName: "",
    hasDraft: false,
    message: "",
  });
});

test("clear removes a stored draft", async () => {
  await using _storage = sessionStorageResource();
  writeEncouragementFormDraft(babyId, { authorName: "", message: "Draft text" });
  clearEncouragementMessageDraft(babyId);
  expect(readEncouragementFormDraft(babyId).message).toBe("");
});

test("expired drafts are dropped on read", async () => {
  await using _storage = sessionStorageResource();
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));
  writeEncouragementFormDraft(babyId, { authorName: "", message: "Old draft" });
  vi.setSystemTime(new Date("2026-08-31T13:00:00.000Z"));
  expect(readEncouragementFormDraft(babyId).message).toBe("");
});

test("drafts younger than the ttl are kept", async () => {
  await using _storage = sessionStorageResource();
  vi.useFakeTimers();
  await using _timers = makeResource({}, () => {
    vi.useRealTimers();
  });
  vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));
  writeEncouragementFormDraft(babyId, { authorName: "", message: "Still fresh" });
  vi.setSystemTime(new Date(Date.parse("2026-08-30T12:00:00.000Z") + 24 * 60 * 60 * 1000 - 1));
  expect(readEncouragementFormDraft(babyId).message).toBe("Still fresh");
});

test("read returns empty when sessionStorage is unavailable", async () => {
  vi.stubGlobal("sessionStorage", undefined);
  await using _storage = makeResource({}, () => {
    vi.unstubAllGlobals();
  });
  expect(readEncouragementFormDraft(babyId).message).toBe("");
});

test("write and clear no-op when sessionStorage is unavailable", async () => {
  vi.stubGlobal("sessionStorage", undefined);
  await using _storage = makeResource({}, () => {
    vi.unstubAllGlobals();
  });
  writeEncouragementFormDraft(babyId, { authorName: "", message: "Draft text" });
  clearEncouragementMessageDraft(babyId);
  expect(readEncouragementFormDraft(babyId).message).toBe("");
});

test("corrupt stored drafts are removed on read", async () => {
  await using _storage = sessionStorageResource();
  sessionStorage.setItem(`encouragement-message-draft:${babyId}`, "not-json{{{");
  expect(readEncouragementFormDraft(babyId).message).toBe("");
  expect(sessionStorage.getItem(`encouragement-message-draft:${babyId}`)).toBeNull();
});

test("invalid stored draft shape is removed on read", async () => {
  await using _storage = sessionStorageResource();
  sessionStorage.setItem(
    `encouragement-message-draft:${babyId}`,
    JSON.stringify({ message: 123, savedAt: Date.now() }),
  );
  expect(readEncouragementFormDraft(babyId).message).toBe("");
  expect(sessionStorage.getItem(`encouragement-message-draft:${babyId}`)).toBeNull();
});

test("legacy message-only drafts still restore the message", async () => {
  await using _storage = sessionStorageResource();
  sessionStorage.setItem(
    `encouragement-message-draft:${babyId}`,
    JSON.stringify({ message: "Older draft", savedAt: Date.now() }),
  );
  expect(readEncouragementFormDraft(babyId)).toEqual({
    authorName: "",
    hasDraft: true,
    message: "Older draft",
  });
});

test("write swallows sessionStorage quota errors", async () => {
  let setItemCalled = false;
  const storage = {
    getItem() {
      return null;
    },
    removeItem() {},
    setItem() {
      setItemCalled = true;
      throw new Error("QuotaExceededError");
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  await using _storage = makeResource({}, () => {
    vi.unstubAllGlobals();
  });
  writeEncouragementFormDraft(babyId, { authorName: "", message: "Draft text" });
  expect(setItemCalled).toBe(true);
});
