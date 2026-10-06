/** Suggests a URL address from a name: "Zespół Ćma" → "zespol-cma". */
export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, (char) => (char === "ł" || char === "Ł" ? "l" : ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}
