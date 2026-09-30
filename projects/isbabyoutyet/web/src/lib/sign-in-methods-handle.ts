import { createContext, useContext } from "react";
import type { PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";

export const SignInMethodsHandleContext = createContext<PreloadedConvexQuery<
  typeof api.signInMethods.get
> | null>(null);

/** The dashboard loader's sign-in methods handle, required by account settings. */
export function useSignInMethodsHandle() {
  const handle = useContext(SignInMethodsHandleContext);
  if (handle === null) {
    throw new Error("Sign-in methods were not preloaded");
  }
  return handle;
}
