import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { HOMEPAGE_DEMO_OWNER_USER_ID } from "../src/seedCredentials";
import { requireAdmin } from "./adminAccess";
import { isActive } from "./softDelete";
import { loadCurrentStatus } from "./timeline";

const sortByValidator = v.union(v.literal("created"), v.literal("updated"));
const sortOrderValidator = v.union(v.literal("asc"), v.literal("desc"));

const languageRequestRowValidator = v.object({
  _id: v.id("languageRequests"),
  requestedLocale: v.string(),
  createdAt: v.number(),
  userId: v.string(),
  userEmail: v.union(v.string(), v.null()),
});

const babyRowValidator = v.object({
  _id: v.id("baby"),
  name: v.string(),
  publicId: v.string(),
  dueDate: v.union(v.string(), v.null()),
  dueDateDisplayMode: v.union(v.literal("exact"), v.literal("message")),
  publicDueDateText: v.union(v.string(), v.null()),
  status: v.union(
    v.literal("not_yet"),
    v.literal("labor_started"),
    v.literal("gone_to_hospital"),
    v.literal("born"),
  ),
  demo: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  managerEmails: v.array(v.string()),
});

/**
 * Resolve a Better Auth user's email. Sentinel / non-document owners
 * (homepage live demos use `homepage-demo`) are not Better Auth rows — looking
 * them up by `_id` throws "Invalid ID length", so skip those.
 */
async function findUserEmail(ctx: QueryCtx, userId: string) {
  if (userId === HOMEPAGE_DEMO_OWNER_USER_ID) {
    return null;
  }
  try {
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: userId }],
    });
    if (!user?.email) return null;
    return String(user.email);
  } catch {
    // Orphan / non-document userIds must not fail the whole admin list.
    return null;
  }
}

async function managerEmailsForBaby(ctx: QueryCtx, baby: Doc<"baby">) {
  const emails: string[] = [];
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
    if (!isActive(row)) continue;
    if (!emails.includes(row.email)) {
      emails.push(row.email);
    }
  }
  return emails;
}

export const listLanguageRequests = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(languageRequestRowValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("languageRequests")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);

    const emailByUserId = new Map<string, string | null>();
    const mapped = [];
    for (const row of result.page) {
      let userEmail = emailByUserId.get(row.userId);
      if (userEmail === undefined) {
        userEmail = await findUserEmail(ctx, row.userId);
        emailByUserId.set(row.userId, userEmail);
      }
      mapped.push({
        _id: row._id,
        requestedLocale: row.requestedLocale,
        createdAt: row.createdAt,
        userId: row.userId,
        userEmail,
      });
    }
    return { ...result, page: mapped };
  },
});

export const listBabies = query({
  args: {
    sortBy: sortByValidator,
    sortOrder: sortOrderValidator,
    hideDemo: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(babyRowValidator),
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
      if (!args.hideDemo) return true;
      return baby.demo !== true;
    });

    const rows = [];
    for (const baby of active) {
      const createdAt = baby._creationTime;
      rows.push({
        _id: baby._id,
        name: baby.name,
        publicId: baby.publicId,
        dueDate: baby.dueDate,
        dueDateDisplayMode: baby.dueDateDisplayMode,
        publicDueDateText: baby.publicDueDateText,
        status: (await loadCurrentStatus(ctx, baby._id)).type,
        demo: baby.demo === true,
        createdAt,
        updatedAt: Math.max(createdAt, baby.lastActivityAt ?? createdAt),
        managerEmails: await managerEmailsForBaby(ctx, baby),
      });
    }
    return { ...result, page: rows };
  },
});
