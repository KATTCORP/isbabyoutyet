import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import { isSupportedLocale } from "@isbabyoutyet/backend/src/i18n";

export function shouldApplyLocaleChange(
  next: string | null | undefined,
  current: SupportedLocale,
): next is SupportedLocale {
  if (!next || !isSupportedLocale(next) || next === current) {
    return false;
  }
  return true;
}
