/// <reference types="vite/client" />
import type { FunctionArgs } from "convex/server";
import type { convexTest } from "convex-test";
import type { api } from "./_generated/api";

/**
 * All Convex function modules for convex-test.
 * Matches files with a single extension ending in `s` (ts/js), which
 * excludes *.test.ts and *.d.ts files.
 */
export const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
  "!./test.setup.ts",
]);

/**
 * Module glob for the convex-table-history component ("babyAuditLog" in
 * convex.config.ts), used by the trigger-wrapped baby mutations.
 */
export const babyAuditLogModules = import.meta.glob([
  "../node_modules/convex-table-history/src/component/**/*.{js,ts}",
  "!../node_modules/convex-table-history/src/component/**/*.test.ts",
  "!../node_modules/convex-table-history/src/component/**/*.d.ts",
]);

/**
 * Module glob for the Better Auth component — needed by the demo seeder
 * (sign-up + email lookup) and any auth-backed tests.
 */
export const betterAuthModules = import.meta.glob([
  "../node_modules/@convex-dev/better-auth/dist/component/**/*.{js,ts}",
  "!../node_modules/@convex-dev/better-auth/dist/component/**/*.test.ts",
  "!../node_modules/@convex-dev/better-auth/dist/component/**/*.d.ts",
  "!../node_modules/@convex-dev/better-auth/dist/component/testProfiles/**",
]);

export const migrationsModules = import.meta.glob([
  "../node_modules/@convex-dev/migrations/dist/component/**/*.{js,ts}",
  "!../node_modules/@convex-dev/migrations/dist/component/**/*.test.ts",
  "!../node_modules/@convex-dev/migrations/dist/component/**/*.d.ts",
]);

type TestConvex = ReturnType<typeof convexTest>;

export async function registerComponents(t: TestConvex) {
  const babyAuditLogSchema =
    // SAFETY: Test fixture is a subset of the production type.
    (await import("../node_modules/convex-table-history/src/component/schema")) as {
      default: Parameters<TestConvex["registerComponent"]>[1];
    };
  t.registerComponent("babyAuditLog", babyAuditLogSchema.default, babyAuditLogModules);

  const betterAuthSchema =
    // SAFETY: Test fixture is a subset of the production type.
    (await import("../node_modules/@convex-dev/better-auth/dist/component/schema.js")) as {
      default: Parameters<TestConvex["registerComponent"]>[1];
    };
  t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);
}

export async function registerMigrationsComponent(t: TestConvex) {
  const migrationsSchema =
    // SAFETY: Test fixture is a subset of the production type.
    (await import("../node_modules/@convex-dev/migrations/dist/component/schema.js")) as {
      default: Parameters<TestConvex["registerComponent"]>[1];
    };
  t.registerComponent("migrations", migrationsSchema.default, migrationsModules);
}

/** Required `baby.create` args with the pre-feature defaults tests used to omit. */
export function createBabyArgs(
  opts: Pick<FunctionArgs<typeof api.baby.create>, "name" | "dueDate"> &
    Partial<FunctionArgs<typeof api.baby.create>>,
): FunctionArgs<typeof api.baby.create> {
  return {
    birthJourney: "labor",
    dueDateDisplayMode: opts.dueDate ? "exact" : "message",
    publicDueDateText: null,
    theme: null,
    ...opts,
  };
}

/** Required `updates.post` args; omitted fields are explicit `null`. */
export function postUpdateArgs(
  opts: Pick<FunctionArgs<typeof api.updates.post>, "babyId"> &
    Partial<FunctionArgs<typeof api.updates.post>>,
): FunctionArgs<typeof api.updates.post> {
  return {
    message: null,
    milestone: null,
    occurredAt: null,
    photoId: null,
    ...opts,
  };
}

/** Required `encouragements.create` metadata; omitted fields are explicit `null`. */
export function createEncouragementArgs(
  opts: Pick<
    FunctionArgs<typeof api.encouragements.create>,
    "babyId" | "authorName" | "message" | "visitorId"
  > &
    Partial<FunctionArgs<typeof api.encouragements.create>>,
): FunctionArgs<typeof api.encouragements.create> {
  return {
    locale: null,
    timezone: null,
    userAgent: null,
    ...opts,
  };
}
