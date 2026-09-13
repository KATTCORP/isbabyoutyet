import { v } from "convex/values";

export const notifiableStatusValidator = v.union(
  v.literal("labor_started"),
  v.literal("gone_to_hospital"),
  v.literal("born"),
  v.literal("photo_added"),
  v.literal("update_posted"),
);

export const ownerMessagePushEventValidator = v.union(v.literal("created"), v.literal("updated"));
