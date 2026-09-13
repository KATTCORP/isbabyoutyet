import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

const convexUrl = import.meta.env.VITE_CONVEX_URL!;
const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL!;

export const authServer = convexBetterAuthReactStart({
  convexUrl,
  convexSiteUrl,
});
