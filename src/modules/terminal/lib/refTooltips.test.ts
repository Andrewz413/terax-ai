import { describe, expect, it } from "vitest";
import {
  compileRefPatterns,
  indexRefFile,
  isValidRefRegex,
  matchRefsInLine,
  normalizeRefPatterns,
} from "./refTooltips";

const valid = { id: "a", pattern: "\\b[DR]-\\d{3}\\b", file: "/gd/log.md" };

describe("normalizeRefPatterns", () => {
  it("returns [] for anything that is not an array", () => {
    expect(normalizeRefPatterns(undefined)).toEqual([]);
    expect(normalizeRefPatterns(null)).toEqual([]);
    expect(normalizeRefPatterns("x")).toEqual([]);
    expect(normalizeRefPatterns({ 0: valid })).toEqual([]);
  });

  it("drops entries with missing or non-string fields", () => {
    expect(
      normalizeRefPatterns([
        valid,
        null,
        "x",
        { id: "", pattern: "a", file: "f" },
        { id: "b", pattern: 3, file: "f" },
        { id: "c", pattern: "a" },
      ]),
    ).toEqual([valid]);
  });

  it("keeps empty pattern and file so drafts survive a settings roundtrip", () => {
    expect(normalizeRefPatterns([{ id: "a", pattern: "", file: "" }])).toEqual([
      { id: "a", pattern: "", file: "" },
    ]);
  });

  it("normalizes backslash paths to the canonical forward-slash form", () => {
    const [p] = normalizeRefPatterns([
      { id: "a", pattern: "x", file: "C:\\gd\\log.md" },
    ]);
    expect(p.file).toBe("C:/gd/log.md");
  });
});

describe("isValidRefRegex", () => {
  it("accepts a valid regex and rejects invalid or empty sources", () => {
    expect(isValidRefRegex("\\b[DR]-\\d{3}\\b")).toBe(true);
    expect(isValidRefRegex("[")).toBe(false);
    expect(isValidRefRegex("")).toBe(false);
  });
});

describe("compileRefPatterns", () => {
  it("compiles with the global flag and skips invalid or incomplete entries", () => {
    const compiled = compileRefPatterns([
      valid,
      { id: "bad", pattern: "[", file: "/f.md" },
      { id: "draft", pattern: "", file: "/f.md" },
      { id: "nofile", pattern: "x", file: "" },
    ]);
    expect(compiled).toHaveLength(1);
    expect(compiled[0].regex.global).toBe(true);
    expect(compiled[0].file).toBe(valid.file);
  });
});

describe("matchRefsInLine", () => {
  const patterns = compileRefPatterns([valid]);

  it("returns [] when nothing matches or there are no patterns", () => {
    expect(matchRefsInLine("plain text", patterns)).toEqual([]);
    expect(matchRefsInLine("D-005", [])).toEqual([]);
    expect(matchRefsInLine("", patterns)).toEqual([]);
  });

  it("finds every occurrence in a line with correct 0-based columns", () => {
    const line = "core en D-005, gate en D-011";
    const matches = matchRefsInLine(line, patterns);
    expect(matches.map((m) => [m.x, m.text])).toEqual([
      [8, "D-005"],
      [23, "D-011"],
    ]);
  });

  it("merges matches from several patterns sorted by column", () => {
    const two = compileRefPatterns([
      valid,
      { id: "b", pattern: "TA-\\d{3}", file: "/gd/ta.md" },
    ]);
    const matches = matchRefsInLine("TA-006 y D-005", two);
    expect(matches.map((m) => m.text)).toEqual(["TA-006", "D-005"]);
    expect(matches[0].pattern.id).toBe("b");
  });

  it("drops overlapping matches, first pattern wins", () => {
    const overlapping = compileRefPatterns([
      { id: "a", pattern: "D-\\d{3}", file: "/a.md" },
      { id: "b", pattern: "D-\\d{3}\\b", file: "/b.md" },
    ]);
    const matches = matchRefsInLine("D-005", overlapping);
    expect(matches).toHaveLength(1);
    expect(matches[0].pattern.id).toBe("a");
  });

  it("never loops on a regex that can match the empty string", () => {
    const zero = compileRefPatterns([{ id: "z", pattern: "x*", file: "/f" }]);
    const matches = matchRefsInLine("axxa", zero);
    expect(matches.map((m) => [m.x, m.text])).toEqual([[1, "xx"]]);
  });
});

describe("indexRefFile", () => {
  const regex = compileRefPatterns([valid])[0].regex;

  it("indexes heading definitions with 1-based line numbers", () => {
    const content = [
      "# Log",
      "",
      "## D-005 · Combat core = Combo Flow · active",
      "body",
      "### R-032 · Que va entre Stage y Stage",
    ].join("\n");
    const index = indexRefFile(content, regex);
    expect(index.get("D-005")).toEqual({
      title: "D-005 · Combat core = Combo Flow · active",
      line: 3,
    });
    expect(index.get("R-032")?.line).toBe(5);
  });

  it("keeps the first definition when a token appears twice", () => {
    const index = indexRefFile("## D-005 · first\n## D-005 · second", regex);
    expect(index.get("D-005")?.title).toBe("D-005 · first");
  });

  it("accepts list or plain lines only when the token opens the line", () => {
    const content = [
      "- D-005 · list definition",
      "prose mentioning D-011 mid-line",
      "R-032 · plain definition",
    ].join("\n");
    const index = indexRefFile(content, regex);
    expect(index.get("D-005")?.title).toBe("D-005 · list definition");
    expect(index.has("D-011")).toBe(false);
    expect(index.get("R-032")?.line).toBe(3);
  });

  it("strips bold markers from titles and handles CRLF", () => {
    const index = indexRefFile(
      "## D-009 · the **incoming** partner\r\nx",
      regex,
    );
    expect(index.get("D-009")?.title).toBe("D-009 · the incoming partner");
  });
});
