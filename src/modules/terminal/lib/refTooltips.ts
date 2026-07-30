export type TerminalRefPattern = {
  id: string;
  pattern: string;
  file: string;
};

export type CompiledRefPattern = {
  id: string;
  regex: RegExp;
  file: string;
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

export function normalizeRefPatterns(value: unknown): TerminalRefPattern[] {
  if (!Array.isArray(value)) return [];
  const out: TerminalRefPattern[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { id, pattern, file } = item as Record<string, unknown>;
    if (typeof id !== "string" || id === "") continue;
    if (typeof pattern !== "string") continue;
    if (typeof file !== "string") continue;
    out.push({ id, pattern, file: file.replace(/\\/g, "/") });
  }
  return out;
}

export function compileRefPatterns(
  patterns: TerminalRefPattern[],
): CompiledRefPattern[] {
  const out: CompiledRefPattern[] = [];
  for (const p of patterns) {
    if (p.pattern === "" || p.file === "") continue;
    try {
      out.push({ id: p.id, regex: new RegExp(p.pattern, "g"), file: p.file });
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
