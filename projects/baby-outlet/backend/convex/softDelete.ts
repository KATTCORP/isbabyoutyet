/**
 * Soft-delete helpers. Records keep their rows so we can recover later;
 * `deletedAt` is a ms epoch when deleted, absent/null when active.
 */

export function isActive(doc: { deletedAt?: number | null }): boolean {
  return doc.deletedAt == null;
}

export function softDeletePatch(now = Date.now()) {
  return { deletedAt: now };
}
