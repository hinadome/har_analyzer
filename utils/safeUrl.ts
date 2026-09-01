/** True when `url` is safe to use as an external navigation target (http/https only). */
export function isNavigableHttpUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
