import { useEffect, useEffectEvent } from "react";

async function conditionalMediationAvailable() {
  if (globalThis.window === undefined || !("PublicKeyCredential" in globalThis)) {
    return false;
  }
  try {
    return await globalThis.PublicKeyCredential.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

/**
 * Offers a saved passkey in the email/password autofill dropdown. Failures
 * stay quiet: typing a password dismisses the ceremony.
 */
export function usePasskeyAutofill(opts: { onPasskey: (signal: AbortSignal) => Promise<void> }) {
  const onPasskey = useEffectEvent(opts.onPasskey);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      const available = await conditionalMediationAvailable();
      if (!available || cancelled) {
        return;
      }
      try {
        await onPasskey(controller.signal);
      } catch {
        // The password form is still there.
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);
}
