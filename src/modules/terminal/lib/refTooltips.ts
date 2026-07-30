export type TerminalRefPattern = {
  id: string;
  pattern: string;
  files: string[];
};

export type CompiledRefPattern = {
  id: string;
  regex: RegExp;
  files: string[];
};

export type RefMatch = {
  x: number;
  text: string;
  pattern: CompiledRefPattern;
};

export type RefEntry = {
  title: string;
  line: number;
};

export function isValidRefRegex(source: string): boolean {
  if (source === "") return false;
  try {
    new RegExp(source, "g");
    return true;
  } catch {
    return false;
  }
}

export function normalizeRefFiles(value: unknown): string[] | null {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : null;
  if (raw === null) return null;
  return raw
    .filter((f): f is string => typeof f === "string")
    .flatMap((f) => f.split(";"))
    .map((f) => f.replace(/\\/g, "/").trim())
    .filter((f) => f !== "");
}

export function normalizeRefPatterns(value: unknown): TerminalRefPattern[] {
  if (!Array.isArray(value)) return [];
  const out: TerminalRefPattern[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { id, pattern, file, files } = item as Record<string, unknown>;
    if (typeof id !== "string" || id === "") continue;
    if (typeof pattern !== "string") continue;
    // `files` is the canonical shape; `file` (string, `;`-separable) is the
    // legacy settings shape and what the single-input settings row commits.
    const list = normalizeRefFiles(files !== undefined ? files : file);
    if (list === null) continue;
    out.push({ id, pattern, files: list });
  }
  return out;
}

export function compileRefPatterns(
  patterns: TerminalRefPattern[],
): CompiledRefPattern[] {
  const out: CompiledRefPattern[] = [];
  for (const p of patterns) {
    if (p.pattern === "" || p.files.length === 0) continue;
    try {
      out.push({ id: p.id, regex: new RegExp(p.pattern, "g"), files: p.files });
    } catch {
      // Invalid regex mid-edit in settings or corrupt on disk: skip, never throw.
    }
  }
  return out;
}

export function matchRefsInLine(
  text: string,
  patterns: CompiledRefPattern[],
): RefMatch[] {
  if (text === "" || patterns.length === 0) return [];
  const all: RefMatch[] = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let m: RegExpExecArray | null = pattern.regex.exec(text);
    while (m !== null) {
      if (m[0] === "") {
        pattern.regex.lastIndex++;
      } else {
        all.push({ x: m.index, text: m[0], pattern });
      }
      m = pattern.regex.exec(text);
    }
  }
  all.sort((a, b) => a.x - b.x);
  const out: RefMatch[] = [];
  let end = -1;
  for (const m of all) {
    if (m.x < end) continue;
    out.push(m);
    end = m.x + m.text.length;
  }
  return out;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_PREFIX_RE = /^[-*>]\s+/;

export function indexRefFile(
  content: string,
  regex: RegExp,
): Map<string, RefEntry> {
  const index = new Map<string, RefEntry>();
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const heading = HEADING_RE.exec(lines[i]);
    const body = heading
      ? heading[2]
      : lines[i].trimStart().replace(LIST_PREFIX_RE, "");
    regex.lastIndex = 0;
    const m = regex.exec(body);
    if (!m || m[0] === "") continue;
    // Outside headings a token only defines the line it opens, so prose
    // mentions never shadow the real definition.
    if (!heading && m.index !== 0) continue;
    if (index.has(m[0])) continue;
    index.set(m[0], {
      title: body.replace(/\*\*/g, "").trim(),
      line: i + 1,
    });
  }
  return index;
}
