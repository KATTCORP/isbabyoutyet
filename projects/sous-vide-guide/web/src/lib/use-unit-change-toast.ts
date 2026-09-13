/**
 * Survives Paraglide’s full-document reload after an explicit locale change so
 * we can toast when the temperature unit also flipped (e.g. en-US → °F).
 *
 * Audited lib seam: owns the one-shot sessionStorage read + toast side effect.
 */
import { useEffect } from "react";
import { toast } from "sonner";

import { m } from "@/paraglide/messages";

export const UNIT_CHANGE_TOAST_KEY = "sous-vide:unit-change-toast";

export function useUnitChangeToast() {
  useEffect(() => {
    const pending = sessionStorage.getItem(UNIT_CHANGE_TOAST_KEY);
    if (pending !== "c" && pending !== "f") {
      return;
    }
    sessionStorage.removeItem(UNIT_CHANGE_TOAST_KEY);
    toast.message(
      pending === "f" ? m.toast_switched_to_fahrenheit() : m.toast_switched_to_celsius(),
    );
  }, []);
}
