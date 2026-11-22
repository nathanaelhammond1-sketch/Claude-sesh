/**
 * Turns the user's own description of unfinished work into candidate subtasks.
 * No guessing: every candidate comes from text the user wrote; they edit and
 * approve each one before anything is saved.
 */
export function parseRemainingWork(text: string): string[] {
  if (!text.trim()) return [];
  const lines = text
    .split(/\r?\n|;|•|·/)
    .map((l) => l.trim())
    .filter(Boolean);

  let items: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^(\s*([-*–—+]|\d+[.)]|\[\s?\]|[a-z][.)])\s*)+/i, '').trim();
    if (!cleaned) continue;
    // A single long sentence listing items: split on commas / " and then " / " then ".
    const parts =
      lines.length === 1 && /,| then /i.test(cleaned)
        ? cleaned
            .split(/,\s*(?:and\s+)?|\s+and then\s+|\s+then\s+/i)
            .map((p) => p.trim())
            .filter(Boolean)
        : [cleaned];
    items.push(...parts);
  }
  items = items
    .map((s) => s.replace(/^(and|also|plus|still need to|need to|i need to|i still need to|to)\s+/i, '').replace(/[.!]+$/, '').trim())
    .filter((s) => s.length > 1)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  // de-duplicate (case-insensitive) while preserving order
  const seen = new Set<string>();
  return items.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 20);
}
