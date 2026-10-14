import { useTransition } from "react";

/**
 * Run async work in a transition and report whether any is in flight — the
 * `isPending` + `mutateAsync` pair of a mutation hook, for work that spans
 * more than one Convex call (web push setup, then a capability refetch).
 */
export function usePendingAction() {
  const [isPending, startTransition] = useTransition();
  const run = <TResult>(action: () => Promise<TResult>) =>
    new Promise<TResult>((resolve, reject) => {
      startTransition(async () => {
        try {
          resolve(await action());
        } catch (error) {
          reject(error);
        }
      });
    });
  return [isPending, run] as const;
}
