export function shortId(id: string) {
  // UUID-ish ids: keep first chunk for readability.
  return id.split('-')[0] ?? id;
}
