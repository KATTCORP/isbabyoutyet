/**
 * True in local Vite DEV and on Vercel preview builds (set via deploy-convex /
 * build-web as `VITE_HAS_DEMO_LOGIN=true`). Production builds leave this false
 * so demo tooling (`DevBar`, login autofill, …) is omitted at the call site —
 * callers must use `{hasDemoLogin ? <DevBar /> : null}`, not mount a no-op.
 */
export const hasDemoLogin = import.meta.env.DEV || import.meta.env.VITE_HAS_DEMO_LOGIN === "true";
