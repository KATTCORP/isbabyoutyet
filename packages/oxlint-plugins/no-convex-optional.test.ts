import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

const undocumented = { messageId: "undocumented" as const };

tester.run("no-undocumented-optional", plugin.rules["no-undocumented-optional"], {
  valid: [
    `import { v } from "convex/values";
       export default defineSchema({
         baby: defineTable({
           name: v.string(),
           dueDate: v.union(v.string(), v.null()),
         }),
       });`,
    `import { v } from "convex/values";
       export const create = mutation({
         args: {
           theme: v.union(v.string(), v.null()),
         },
       });`,
    `import { v } from "convex/values";
       export default defineSchema({
         baby: defineTable({
           /**
            * @todo Optional until every row sets this key.
            */
           theme: v.optional(v.union(v.string(), v.null())),
         }),
       });`,
    `import { v } from "convex/values";
       /** @todo Optional until callers pass null. */
       const localeArg = v.optional(v.string());`,
    `import { v } from "convex/values";
       /** @todo Keep mirroring the migrations runner. */
       export const runAll = internalMutation({
         args: {
           /** @todo Keep mirroring the migrations runner. */
           dryRun: v.optional(v.boolean()),
         },
       });`,
    `import { v as validators } from "convex/values";
       const args = {
         /** @deprecated Optional until callers pass null. */
         visitorId: validators.optional(v.string()),
       };`,
    `import * as values from "convex/values";
       const args = {
         /** @todo Optional until callers pass null. */
         visitorId: values.v.optional(values.v.string()),
       };`,
    // Not from convex/values.
    `const v = { optional: (x) => x };
       const theme = v.optional("x");`,
    {
      filename: "projects/isbabyoutyet/backend/convex/convex.config.ts",
      code: `import { v } from "convex/values";
               const app = defineApp({
                 env: { SITE_URL: v.optional(v.string()) },
               });`,
    },
    // Same shape as `baby.update`: `{ id, patch }` with all-partial patch.
    `import { v } from "convex/values";
       export const update = mutationWithTriggers({
         args: {
           id: v.id("baby"),
           patch: v.object({
             dueDate: v.optional(v.union(v.string(), v.null())),
             dueDateDisplayMode: v.optional(v.string()),
             publicDueDateText: v.optional(v.union(v.string(), v.null())),
             name: v.optional(v.string()),
             theme: v.optional(v.union(v.string(), v.null())),
             locale: v.optional(v.union(v.string(), v.null())),
             birthJourney: v.optional(v.string()),
           }),
         },
       });`,
    `import { v } from "convex/values";
       export const patchBaby = mutation({
         args: {
           id: v.id("baby"),
           patch: v.object({
             name: v.optional(v.string()),
           }),
         },
       });`,
    `import { v } from "convex/values";
       export const patch = mutation({
         args: {
           id: v.id("baby"),
           patch: v.object({
             theme: v.optional(v.string()),
           }),
         },
       });`,
    // Composite id object (two or more `v.id(...)` fields).
    `import { v } from "convex/values";
       export const patchThumbnail = mutation({
         args: {
           id: v.object({
             babyId: v.id("baby"),
             thumbnailId: v.id("_storage"),
           }),
           patch: v.object({
             blurDataUrl: v.optional(v.union(v.string(), v.null())),
           }),
         },
       });`,
  ],
  invalid: [
    {
      code: `import { v } from "convex/values";
               export default defineSchema({
                 baby: defineTable({
                   theme: v.optional(v.union(v.string(), v.null())),
                 }),
               });`,
      errors: [undocumented],
    },
    {
      code: `import { v } from "convex/values";
               export const create = mutation({
                 args: {
                   birthJourney: v.optional(v.string()),
                 },
               });`,
      errors: [undocumented],
    },
    {
      code: `import { v } from "convex/values";
               const localeArg = v.optional(v.string());`,
      errors: [undocumented],
    },
    {
      // Line comments are not JSDoc.
      code: `import { v } from "convex/values";
               // @deprecated not a jsdoc
               const localeArg = v.optional(v.string());`,
      errors: [undocumented],
    },
    {
      // Non-JSDoc block comments do not count.
      code: `import { v } from "convex/values";
               /* @todo not a jsdoc */
               const localeArg = v.optional(v.string());`,
      errors: [undocumented],
    },
    {
      code: `import { v as validators } from "convex/values";
               const args = { visitorId: validators.optional(validators.string()) };`,
      errors: [undocumented],
    },
    {
      code: `import * as values from "convex/values";
               const args = { visitorId: values.v.optional(values.v.string()) };`,
      errors: [undocumented],
    },
    {
      code: `import { v } from "convex/values";
               const args = { visitorId: v["optional"](v.string()) };`,
      errors: [undocumented],
    },
    {
      // Flat sibling optionals are not `{ id, patch }`.
      code: `import { v } from "convex/values";
               export const update = mutation({
                 args: {
                   babyId: v.id("baby"),
                   theme: v.optional(v.string()),
                 },
               });`,
      errors: [undocumented],
    },
    {
      // `create` is not a sparse patch mutation.
      code: `import { v } from "convex/values";
               export const create = mutation({
                 args: {
                   id: v.id("baby"),
                   patch: v.object({
                     theme: v.optional(v.string()),
                   }),
                 },
               });`,
      errors: [undocumented],
    },
    {
      // `updatePhoto` is not the `update` / `patch*` name.
      code: `import { v } from "convex/values";
               export const updatePhoto = mutation({
                 args: {
                   id: v.id("baby"),
                   patch: v.object({
                     photoId: v.optional(v.id("_storage")),
                   }),
                 },
               });`,
      errors: [undocumented],
    },
    {
      // Sparse patch still needs a required `id`.
      code: `import { v } from "convex/values";
               export const update = mutation({
                 args: {
                   patch: v.object({
                     theme: v.optional(v.string()),
                   }),
                 },
               });`,
      errors: [undocumented],
    },
    {
      // Optional id is not the required-id shape.
      code: `import { v } from "convex/values";
               export const update = mutation({
                 args: {
                   id: v.optional(v.id("baby")),
                   patch: v.object({
                     theme: v.optional(v.string()),
                   }),
                 },
               });`,
      errors: [undocumented, undocumented],
    },
    {
      // A single-field `id` object is not a composite id.
      code: `import { v } from "convex/values";
               export const patch = mutation({
                 args: {
                   id: v.object({
                     babyId: v.id("baby"),
                   }),
                   patch: v.object({
                     theme: v.optional(v.string()),
                   }),
                 },
               });`,
      errors: [undocumented],
    },
    {
      // `{ id, data }` is not the `{ id, patch }` shape.
      code: `import { v } from "convex/values";
               export const update = mutation({
                 args: {
                   id: v.id("baby"),
                   data: v.object({
                     theme: v.optional(v.string()),
                   }),
                 },
               });`,
      errors: [undocumented],
    },
  ],
});
