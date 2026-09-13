import { v } from "convex/values";

export const supportedLocaleValidator = v.union(
  v.literal("en-GB"),
  v.literal("en-US"),
  v.literal("sv"),
  v.literal("es"),
  v.literal("pt-BR"),
);
