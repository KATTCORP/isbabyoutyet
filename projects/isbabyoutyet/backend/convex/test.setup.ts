/// <reference types="vite/client" />
import type { FunctionArgs } from "convex/server";
import type { convexTest } from "convex-test";
import betterAuthSchema from "./betterAuth/schema";
import migrationsSchema from "../node_modules/@convex-dev/migrations/dist/component/schema.js";
import babyAuditLogSchema from "../node_modules/convex-table-history/src/component/schema";
import type { api } from "./_generated/api";

/**
 * Imports eagerly while the test file loads, then hands convex-test the lazy
 * loaders it expects. Lazy globs made the first convex-test call in each file
 * import every module inside the test body, which alone could exceed the 5s
 * test timeout when CI runs every workspace's suite in parallel.
 */
function preloaded<TModule>(eager: Record<string, TModule>) {
  return Object.fromEntries(
    Object.entries(eager).map(([path, module]) => [path, () => Promise.resolve(module)]),
  );
}

/**
 * All Convex function modules for convex-test.
 * Matches files with a single extension ending in `s` (ts/js), which
 * excludes *.test.ts and *.d.ts files.
 */
export const modules = preloaded(
  import.meta.glob(
    [
      "./**/*.{js,ts}",
      "!./**/*.test.ts",
      "!./**/*.d.ts",
      "!./test.setup.ts",
      "!./convex.config.ts",
    ],
    {
      eager: true,
    },
  ),
);

/**
 * Module glob for the convex-table-history component ("babyAuditLog" in
 * convex.config.ts), used by the trigger-wrapped baby mutations.
 */
export const babyAuditLogModules = preloaded(
  import.meta.glob(
    [
      "../node_modules/convex-table-history/src/component/**/*.{js,ts}",
      "!../node_modules/convex-table-history/src/component/**/*.test.ts",
      "!../node_modules/convex-table-history/src/component/**/*.d.ts",
    ],
    { eager: true },
  ),
);

/**
 * Module glob for the Better Auth component — needed by the demo seeder
 * (sign-up + email lookup) and any auth-backed tests.
 */
export const betterAuthModules = preloaded(
  import.meta.glob(
    ["./betterAuth/**/*.{js,ts}", "!./betterAuth/**/*.test.ts", "!./betterAuth/**/*.d.ts"],
    { eager: true },
  ),
);

export const migrationsModules = preloaded(
  import.meta.glob(
    [
      "../node_modules/@convex-dev/migrations/dist/component/**/*.{js,ts}",
      "!../node_modules/@convex-dev/migrations/dist/component/**/*.test.ts",
      "!../node_modules/@convex-dev/migrations/dist/component/**/*.d.ts",
    ],
    { eager: true },
  ),
);

type TestConvex = ReturnType<typeof convexTest>;
type ComponentSchema = Parameters<TestConvex["registerComponent"]>[1];

export function registerComponents(t: TestConvex) {
  // SAFETY: Test fixture is a subset of the production type.
  t.registerComponent("babyAuditLog", babyAuditLogSchema as ComponentSchema, babyAuditLogModules);
  // SAFETY: Test fixture is a subset of the production type.
  t.registerComponent("betterAuth", betterAuthSchema as ComponentSchema, betterAuthModules);
}

export function registerMigrationsComponent(t: TestConvex) {
  // SAFETY: Test fixture is a subset of the production type.
  t.registerComponent("migrations", migrationsSchema as ComponentSchema, migrationsModules);
}

const TEST_PHOTO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWM4EaABAAMkAUFIBLJyAAAAAElFTkSuQmCC";

/**
 * A decodable 1×1 PNG. Storing photos through the real mutations schedules
 * `babyThumbnails.generateThumbnail`, which runs sharp on the bytes — fake
 * bytes make that job log a decode error from inside the test.
 */
export function testPhotoBlob() {
  return new Blob([Uint8Array.from(atob(TEST_PHOTO_PNG_BASE64), (char) => char.charCodeAt(0))], {
    type: "image/png",
  });
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
