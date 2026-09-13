import { v } from "convex/values";

export const onboardingStepIdValidator = v.union(
  v.literal("add_baby"),
  v.literal("share_link"),
  v.literal("post_update"),
  v.literal("explore_settings"),
  v.literal("learn_encouragements"),
);
