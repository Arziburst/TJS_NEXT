// Text for an HTML output channel (Telegram's parse_mode HTML, the emails): every value a customer or the admin
// typed passes through here before it meets a tag (D20: the legacy Telegram message was not escaped).
const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/** At most `max` characters (whole code points), with "…" when cut; cut before escaping, never inside an entity. */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}
