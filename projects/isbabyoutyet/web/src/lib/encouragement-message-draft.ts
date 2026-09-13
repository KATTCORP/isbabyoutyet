import type { Id } from "@isbabyoutyet/backend/convex/_generated/dataModel";
import { z } from "zod";

export const ENCOURAGEMENT_MESSAGE_DRAFT_DEBOUNCE_MS = 500;
const ENCOURAGEMENT_MESSAGE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const draftRecordSchema = z.object({
  authorName: z.string().optional(),
  message: z.string(),
  savedAt: z.number(),
});

export type EncouragementFormDraft = {
  authorName: string;
  message: string;
};

function encouragementMessageDraftKey(babyId: Id<"baby">) {
  return `encouragement-message-draft:${babyId}`;
}

function readRawDraft(babyId: Id<"baby">) {
  if (globalThis.sessionStorage === undefined) {
    return null;
  }
  const key = encouragementMessageDraftKey(babyId);
  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = draftRecordSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      sessionStorage.removeItem(key);
      return null;
    }
    const record = parsed.data;
    if (Date.now() - record.savedAt > ENCOURAGEMENT_MESSAGE_DRAFT_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return { key, record };
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function readEncouragementFormDraft(babyId: Id<"baby">): EncouragementFormDraft & {
  hasDraft: boolean;
} {
  const raw = readRawDraft(babyId);
  if (!raw) {
    return { authorName: "", hasDraft: false, message: "" };
  }
  return {
    authorName: raw.record.authorName ?? "",
    hasDraft: true,
    message: raw.record.message,
  };
}

export function writeEncouragementFormDraft(babyId: Id<"baby">, draft: EncouragementFormDraft) {
  if (globalThis.sessionStorage === undefined) {
    return;
  }
  const key = encouragementMessageDraftKey(babyId);
  if (!draft.authorName.trim() && !draft.message.trim()) {
    sessionStorage.removeItem(key);
    return;
  }
  try {
    const record = draftRecordSchema.parse({
      authorName: draft.authorName,
      message: draft.message,
      savedAt: Date.now(),
    });
    sessionStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Best effort — private mode / quota.
  }
}

export function clearEncouragementMessageDraft(babyId: Id<"baby">) {
  if (globalThis.sessionStorage === undefined) {
    return;
  }
  sessionStorage.removeItem(encouragementMessageDraftKey(babyId));
}
