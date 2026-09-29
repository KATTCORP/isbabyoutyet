/**
 * The More info drawer is owned by the URL hash alone: `#info-<cutId>` means
 * that cut's drawer is open, anything else means closed. The info button
 * carries the same id, so a shared link scrolls to the card on load.
 */
const INFO_HASH_PREFIX = "info-";

export function infoHash(cutId: string) {
  return `${INFO_HASH_PREFIX}${cutId}`;
}

/** Cut id whose drawer the hash opens, or "" when no drawer is open. */
export function infoCutIdFromHash(hash: string) {
  return hash.startsWith(INFO_HASH_PREFIX) ? hash.slice(INFO_HASH_PREFIX.length) : "";
}
