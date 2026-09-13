import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { deleteEncouragementWithTimelineItem, insertEncouragementTimelineItem } from "./timeline";
import { appIdentity } from "./authIdentity";
import { canManageBaby } from "./babyAccess";
import { isActive } from "./softDelete";

const MAX_NAME_LENGTH = 50;
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isWithinEditWindow(createdAt: number): boolean {
  return Date.now() - createdAt < EDIT_WINDOW_MS;
}

export const create = mutation({
  args: {
    babyId: v.id("baby"),
    authorName: v.string(),
    message: v.string(),
    visitorId: v.string(),
    userAgent: v.optional(v.string()),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate baby exists and is not soft-deleted
    const baby = await ctx.db.get(args.babyId);
    if (!baby || !isActive(baby)) {
      throw new Error("Baby not found");
    }

    // Check if encouragements are enabled
    if (baby.encouragementsDisabled) {
      throw new Error("Encouragements are disabled for this baby");
    }

    // Validate author name
    const trimmedName = args.authorName.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name is required");
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw new Error(`Name must be ${MAX_NAME_LENGTH} characters or less`);
    }

    // Validate message
    const trimmedMessage = args.message.trim();
    if (trimmedMessage.length === 0) {
      throw new Error("Message is required");
    }

    const createdAt = Date.now();
    const timelineItemId = await insertEncouragementTimelineItem(ctx, {
      babyId: args.babyId,
      postedAt: createdAt,
    });
    const encouragementId = await ctx.db.insert("encouragements", {
      babyId: args.babyId,
      authorName: trimmedName,
      message: trimmedMessage,
      createdAt,
      timelineItemId,
      visitorId: args.visitorId,
      userAgent: args.userAgent,
      locale: args.locale,
      timezone: args.timezone,
    });

    return encouragementId;
  },
});

export const update = mutation({
  args: {
    encouragementId: v.id("encouragements"),
    visitorId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const encouragement = await ctx.db.get(args.encouragementId);
    if (!encouragement || !isActive(encouragement)) {
      throw new Error("Encouragement not found");
    }

    // Validate visitor ID matches
    if (encouragement.visitorId !== args.visitorId) {
      throw new Error("Not authorized to edit this encouragement");
    }

    // Validate within edit window
    if (!isWithinEditWindow(encouragement.createdAt)) {
      throw new Error("Edit window has expired (15 minutes)");
    }

    // Validate message
    const trimmedMessage = args.message.trim();
    if (trimmedMessage.length === 0) {
      throw new Error("Message is required");
    }

    await ctx.db.patch(args.encouragementId, {
      message: trimmedMessage,
    });
  },
});

export const listByBaby = query({
  args: {
    babyId: v.id("baby"),
    // The caller's own visitor id, only used to mark their posts with `isMine`
    visitorId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("encouragements")
      .withIndex("by_babyId_and_createdAt", (q) => q.eq("babyId", args.babyId))
      .order("desc")
      .paginate(args.paginationOpts);

    // Public DTO: never return visitorId (the edit/delete credential) or the
    // userAgent/locale/timezone metadata. Soft-deleted rows are omitted.
    return {
      ...result,
      page: result.page.filter(isActive).map((encouragement) => ({
        _id: encouragement._id,
        authorName: encouragement.authorName,
        message: encouragement.message,
        createdAt: encouragement.createdAt,
        isMine: args.visitorId !== undefined && encouragement.visitorId === args.visitorId,
      })),
    };
  },
});

export const remove = mutation({
  args: {
    encouragementId: v.id("encouragements"),
    visitorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const encouragement = await ctx.db.get(args.encouragementId);
    if (!encouragement || !isActive(encouragement)) {
      throw new Error("Encouragement not found");
    }

    const baby = await ctx.db.get(encouragement.babyId);
    if (!baby || !isActive(baby)) {
      throw new Error("Baby not found");
    }

    // Check if user can manage the baby (owner or co-parent)
    const identity = await ctx.auth.getUserIdentity();
    const isManager = identity
      ? await canManageBaby(ctx, { baby, identity: appIdentity(identity) })
      : false;

    // Check if visitor can delete (matches visitorId and within time window)
    const canVisitorDelete =
      args.visitorId &&
      encouragement.visitorId === args.visitorId &&
      isWithinEditWindow(encouragement.createdAt);

    if (!isManager && !canVisitorDelete) {
      throw new Error("Not authorized to delete this encouragement");
    }

    await deleteEncouragementWithTimelineItem(ctx, encouragement);
  },
});
