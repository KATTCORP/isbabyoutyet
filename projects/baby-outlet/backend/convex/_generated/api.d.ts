/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminAccess from "../adminAccess.js";
import type * as auth from "../auth.js";
import type * as authIdentity from "../authIdentity.js";
import type * as baby from "../baby.js";
import type * as babyAccess from "../babyAccess.js";
import type * as babyDto from "../babyDto.js";
import type * as babyThumbnails from "../babyThumbnails.js";
import type * as coParents from "../coParents.js";
import type * as encouragements from "../encouragements.js";
import type * as homepageDemo from "../homepageDemo.js";
import type * as http from "../http.js";
import type * as i18n from "../i18n.js";
import type * as migrations from "../migrations.js";
import type * as onboarding from "../onboarding.js";
import type * as onboardingValidators from "../onboardingValidators.js";
import type * as profile from "../profile.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as requiredEnv from "../requiredEnv.js";
import type * as seed from "../seed.js";
import type * as softDelete from "../softDelete.js";
import type * as timeline from "../timeline.js";
import type * as triggers from "../triggers.js";
import type * as updates from "../updates.js";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminAccess: typeof adminAccess;
  auth: typeof auth;
  authIdentity: typeof authIdentity;
  baby: typeof baby;
  babyAccess: typeof babyAccess;
  babyDto: typeof babyDto;
  babyThumbnails: typeof babyThumbnails;
  coParents: typeof coParents;
  encouragements: typeof encouragements;
  homepageDemo: typeof homepageDemo;
  http: typeof http;
  i18n: typeof i18n;
  migrations: typeof migrations;
  onboarding: typeof onboarding;
  onboardingValidators: typeof onboardingValidators;
  profile: typeof profile;
  pushNotifications: typeof pushNotifications;
  pushSubscriptions: typeof pushSubscriptions;
  requiredEnv: typeof requiredEnv;
  seed: typeof seed;
  softDelete: typeof softDelete;
  timeline: typeof timeline;
  triggers: typeof triggers;
  updates: typeof updates;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  babyAuditLog: import("convex-table-history/_generated/component.js").ComponentApi<"babyAuditLog">;
};
