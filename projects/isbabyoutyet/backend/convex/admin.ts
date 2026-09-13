import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { HOMEPAGE_DEMO_OWNER_USER_ID } from "../src/seedCredentials";
import {
  isJsonObjectValue,
  parseJsonBoolean,
  parseJsonString,
  type JsonObject,
} from "@workspace/runtime/json";
import { requireAdmin } from "./adminAccess";
import { authComponent } from "./auth";
import { transferBabyPublicId } from "./babyPublicId";
import { isActive } from "./softDelete";
import { loadCurrentStatus } from "./timeline";
import { mutationWithTriggers } from "./triggers";

const sortByValidator = v.union(v.literal("created"), v.literal("updated"));
const sortOrderValidator = v.union(v.literal("asc"), v.literal("desc"));

const babyRowValidator = v.object({
  _id: v.id("baby"),
  createdAt: v.number(),
  demo: v.boolean(),
  dueDate: v.union(v.string(), v.null()),
  dueDateDisplayMode: v.union(v.literal("exact"), v.literal("message")),
  managerEmails: v.array(v.string()),
  name: v.string(),
  publicDueDateText: v.union(v.string(), v.null()),
  publicId: v.string(),
  status: v.union(
    v.literal("not_yet"),
    v.literal("labor_started"),
    v.literal("gone_to_hospital"),
    v.literal("born"),
  ),
  updatedAt: v.number(),
});

const userBabySummaryValidator = v.object({
  demo: v.boolean(),
  name: v.string(),
  publicId: v.string(),
});

const userRowValidator = v.object({
  _id: v.string(),
  babies: v.array(userBabySummaryValidator),
  createdAt: v.number(),
  email: v.string(),
  name: v.string(),
});

export function parseAuthUserPage<TResult>(result: TResult) {
  if (!isJsonObjectValue(result) || !Array.isArray(result.page)) {
    throw new Error("Better Auth returned an invalid user page");
  }
  const users = result.page.filter(isJsonObjectValue);
  const isDone = "isDone" in result ? parseJsonBoolean(result.isDone) : null;
  const continueCursor = "continueCursor" in result ? parseJsonString(result.continueCursor) : null;
  if (users.length !== result.page.length || isDone === null || continueCursor === null) {
    throw new Error("Better Auth returned invalid user pagination");
  }
  return {
    continueCursor,
    isDone,
    page: users,
  };
}

function authUserRow(user: JsonObject) {
  return {
    _id: String(user._id),
    createdAt: Number(user.createdAt),
    email: String(user.email),
    name: String(user.name),
  };
}

async function ownedBabiesForUser(ctx: QueryCtx, userId: string) {
  const babies = await ctx.db
    .query("baby")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(100);
  const rows = [];
  for (const baby of babies) {
    if (!isActive(baby)) {
      continue;
    }
    rows.push({
      demo: baby.demo === true,
      name: baby.name,
      publicId: baby.publicId,
    });
  }
  return rows;
}

/**
 * Resolve a Better Auth user's email. Sentinel / non-document owners
 * (homepage live demos use `homepage-demo`) are not Better Auth rows — looking
 * them up by `_id` throws "Invalid ID length", so skip those.
 */
async function findUserEmail(ctx: QueryCtx | MutationCtx, userId: string) {
  if (userId === HOMEPAGE_DEMO_OWNER_USER_ID) {
    return null;
  }
  try {
    const user = await authComponent.getAnyUserById(ctx, userId);
    return user?.email ?? null;
  } catch {
    // Orphan / non-document userIds must not fail the whole admin list.
    return null;
  }
}

async function managerEmailsForBaby(ctx: QueryCtx, baby: Doc<"baby">) {
  const emails: Array<string> = [];
  const ownerEmail = await findUserEmail(ctx, baby.userId);
  if (ownerEmail) {
    emails.push(ownerEmail);
  }

  const coParents = await ctx.db
    .query("babyCoParents")
    .withIndex("by_babyId", (q) => q.eq("babyId", baby._id))
    .order("desc")
    .take(100);
  for (const row of coParents) {
    if (!isActive(row)) {
      continue;
    }
    if (!emails.includes(row.email)) {
      emails.push(row.email);
    }
  }
  return emails;
}

export const listBabies = query({
  args: {
    hideDemo: v.boolean(),
    paginationOpts: paginationOptsValidator,
    sortBy: sortByValidator,
    sortOrder: sortOrderValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result =
      args.sortBy === "created"
        ? await ctx.db.query("baby").order(args.sortOrder).paginate(args.paginationOpts)
        : await ctx.db
            .query("baby")
            .withIndex("by_lastActivityAt")
            .order(args.sortOrder)
            .paginate(args.paginationOpts);
    const active = result.page.filter(isActive).filter((baby) => {
      if (!args.hideDemo) {
        return true;
      }
      return baby.demo !== true;
    });

    const rows = [];
    for (const baby of active) {
      const createdAt = baby._creationTime;
      rows.push({
        _id: baby._id,
        createdAt,
        demo: baby.demo === true,
        dueDate: baby.dueDate,
        dueDateDisplayMode: baby.dueDateDisplayMode,
        managerEmails: await managerEmailsForBaby(ctx, baby),
        name: baby.name,
        publicDueDateText: baby.publicDueDateText,
        publicId: baby.publicId,
        status: (await loadCurrentStatus(ctx, baby._id)).type,
        updatedAt: Math.max(createdAt, baby.lastActivityAt),
      });
    }
    return { ...result, page: rows };
  },
  returns: paginationResultValidator(babyRowValidator),
});

/** Newest Better Auth signups first — staff review of recent registrations. */
export const listUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: args.paginationOpts,
      sortBy: { direction: "desc", field: "createdAt" },
    });
    const validated = parseAuthUserPage(result);

    const page = [];
    for (const user of validated.page) {
      const row = authUserRow(user);
      page.push({
        ...row,
        babies: await ownedBabiesForUser(ctx, row._id),
      });
    }
    return {
      continueCursor: validated.continueCursor,
      isDone: validated.isDone,
      page,
    };
  },
  returns: paginationResultValidator(userRowValidator),
});

const publicIdTransferRowValidator = v.object({
  _id: v.id("babyPublicIdTransfers"),
  actorEmail: v.union(v.string(), v.null()),
  actorUserId: v.string(),
  babyId: v.id("baby"),
  babyName: v.string(),
  createdAt: v.number(),
  displacedBabyId: v.union(v.id("baby"), v.null()),
  displacedBabyName: v.union(v.string(), v.null()),
  displacedPublicId: v.union(v.string(), v.null()),
  fromPublicId: v.string(),
  motivation: v.string(),
  toPublicId: v.string(),
});

const transferPublicIdResultValidator = v.object({
  displacedPublicId: v.union(v.string(), v.null()),
  fromPublicId: v.string(),
  toPublicId: v.string(),
});

export const listPublicIdTransfers = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("babyPublicIdTransfers")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((row) => ({
        _id: row._id,
        actorEmail: row.actorEmail,
        actorUserId: row.actorUserId,
        babyId: row.babyId,
        babyName: row.babyName,
        createdAt: row.createdAt,
        displacedBabyId: row.displacedBabyId,
        displacedBabyName: row.displacedBabyName,
        displacedPublicId: row.displacedPublicId,
        fromPublicId: row.fromPublicId,
        motivation: row.motivation,
        toPublicId: row.toPublicId,
      })),
    };
  },
  returns: paginationResultValidator(publicIdTransferRowValidator),
});

/**
 * Move a baby page to a new public URL. The old slug stays in history so
 * visitors hitting `/baby/{from}` redirect to `/baby/{to}`. If `{to}` is
 * already held, that occupant is moved to the next generated slug. Staff
 * must record a motivation; the transfer is written to the audit table.
 */
export const transferPublicId = mutationWithTriggers({
  args: {
    fromPublicId: v.string(),
    motivation: v.string(),
    toPublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    return await transferBabyPublicId(ctx, {
      actorEmail: await findUserEmail(ctx, caller.authUserId),
      actorTokenIdentifier: caller.tokenIdentifier,
      actorUserId: caller.authUserId,
      fromPublicId: args.fromPublicId,
      motivation: args.motivation,
      toPublicId: args.toPublicId,
    });
  },
  returns: transferPublicIdResultValidator,
});
