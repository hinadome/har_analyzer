/** Worker-safe body ID generator (no IndexedDB imports). */

export function newBodyId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
