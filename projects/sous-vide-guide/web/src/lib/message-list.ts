/**
 * Split a comma-separated message value into trimmed parts. Lists that differ
 * per locale (search aliases) are stored as one message so translators can
 * add, drop, or reorder items without touching code.
 */
export function splitMessageList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
