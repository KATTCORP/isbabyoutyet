/**
 * True in local Vite DEV and on Vercel preview builds (set via deploy-convex /
 * build-web). Production builds leave this false so demo tooling stays hidden.
 */
export const hasDemoLogin = import.meta.env.DEV || import.meta.env.VITE_HAS_DEMO_LOGIN === "true";
