import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import { isSupportedLocale } from "@baby-outlet/backend/src/i18n";

export function shouldApplyLocaleChange(
  next: string | null | undefined,
  current: SupportedLocale,
): next is SupportedLocale {
  if (!next || !isSupportedLocale(next) || next === current) {
    return false;
  }
  return true;
}
