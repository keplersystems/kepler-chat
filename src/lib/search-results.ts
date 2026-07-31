import type { PartView } from "$lib/contracts";

export interface SearchResult {
  title: string;
  url: string;
  domain: string;
}

type ToolPart = Extract<PartView, { type: "tool" }>;

/** Claude's WebSearch embeds a JSON array of links in its output text. */
const LINKS_JSON = /Links:\s*(\[[\s\S]*?\])\s*(?:\n|$)/;
/** Exa (opencode) emits one `Title:`/`URL:` stanza per result. */
const TITLE_URL_STANZA = /^Title:[ \t]*(.+)\r?\nURL:[ \t]*(\S+)/gm;

function toResult(title: string, url: string): SearchResult | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  try {
    return { title: trimmed, url, domain: new URL(url).hostname };
  } catch {
    return null;
  }
}

function fromLinksJson(text: string): SearchResult[] {
  const match = LINKS_JSON.exec(text);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { title, url } = entry as { title?: unknown; url?: unknown };
    if (typeof title !== "string" || typeof url !== "string") return [];
    const result = toResult(title, url);
    return result ? [result] : [];
  });
}

function fromStanzas(text: string): SearchResult[] {
  return [...text.matchAll(TITLE_URL_STANZA)].flatMap((match) => {
    const result = toResult(match[1], match[2]);
    return result ? [result] : [];
  });
}

/**
 * Web results a search tool reported, as rows the trail can render. Engines
 * format their output differently and none of it is structured on the wire, so
 * an unrecognised shape yields nothing rather than a guess.
 */
export function searchResults(part: ToolPart): SearchResult[] {
  const text = part.content
    .filter((item): item is Extract<typeof item, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  if (!text) return [];
  const found = fromLinksJson(text);
  const results = found.length > 0 ? found : fromStanzas(text);
  const seen = new Set<string>();
  return results.filter((result) => !seen.has(result.url) && seen.add(result.url));
}
