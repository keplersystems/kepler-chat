import { createHighlighter, type BundledLanguage, type Highlighter } from "shiki";

const themes = { light: "github-light-default", dark: "github-dark-default" } as const;

const languages = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "bash",
  "sh",
  "python",
  "rust",
  "go",
  "html",
  "css",
  "svelte",
  "sql",
  "yaml",
  "toml",
  "md",
  "diff",
] as const satisfies readonly BundledLanguage[];

type Lang = (typeof languages)[number];

const aliases: Record<string, Lang> = {
  typescript: "ts",
  javascript: "js",
  py: "python",
  rs: "rust",
  golang: "go",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  yml: "yaml",
  markdown: "md",
};

const known = new Set<string>(languages);

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [themes.light, themes.dark],
    langs: [],
  });
  return highlighterPromise;
}

function resolveLang(lang: string): Lang | "plaintext" {
  const id = lang.trim().toLowerCase();
  if (known.has(id)) return id as Lang;
  return aliases[id] ?? "plaintext";
}

/** Output is safe for {@html}: shiki escapes all code content. */
export async function highlightToHtml(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const resolved = resolveLang(lang);
  if (resolved !== "plaintext" && !highlighter.getLoadedLanguages().includes(resolved)) {
    await highlighter.loadLanguage(resolved);
  }
  return highlighter.codeToHtml(code, { lang: resolved, themes, defaultColor: false });
}
