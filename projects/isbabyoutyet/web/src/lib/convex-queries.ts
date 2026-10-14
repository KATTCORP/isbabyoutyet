import { api } from "@isbabyoutyet/backend/convex/_generated/api";
import { convexPaginatedQuery, convexQuery } from "@workspace/convex-query";

/**
 * raf-query factories for the Convex queries the app reads, shaped like
 * `api`. They are values rather than inline `convexQuery(api.x)` calls
 * because TypeScript can't infer a verb's input from a generic call passed
 * in place: `queryClient.ensure(queries.profile.get, {})` type-checks where
 * `queryClient.ensure(convexQuery(api.profile.get), {})` does not.
 */
export const queries = {
  admin: {
    listBabies: convexPaginatedQuery(api.admin.listBabies),
    listPublicIdTransfers: convexPaginatedQuery(api.admin.listPublicIdTransfers),
    listUsers: convexPaginatedQuery(api.admin.listUsers),
  },
  baby: {
    getByPublicId: convexQuery(api.baby.getByPublicId),
    getManagerBaby: convexQuery(api.baby.getManagerBaby),
    getScheduledNotifications: convexQuery(api.baby.getScheduledNotifications),
    listByUser: convexQuery(api.baby.listByUser),
  },
  coParents: {
    listForBaby: convexQuery(api.coParents.listForBaby),
    myAccess: convexQuery(api.coParents.myAccess),
  },
  onboarding: {
    getMine: convexQuery(api.onboarding.getMine),
  },
  profile: {
    get: convexQuery(api.profile.get),
  },
  pushSubscriptions: {
    getPublicKey: convexQuery(api.pushSubscriptions.getPublicKey),
    getSubscriptionCount: convexQuery(api.pushSubscriptions.getSubscriptionCount),
    isOwnerSubscribed: convexQuery(api.pushSubscriptions.isOwnerSubscribed),
    isSubscribed: convexQuery(api.pushSubscriptions.isSubscribed),
  },
  timeline: {
    getUpdatePhoto: convexQuery(api.timeline.getUpdatePhoto),
    latestUpdate: convexQuery(api.timeline.latestUpdate),
    listByBaby: convexPaginatedQuery(api.timeline.listByBaby),
  },
};
