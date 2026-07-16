import * as React from "react";

/*
 * Original model glyphs — abstract geometric marks, deliberately NOT brand
 * logos. Each is authored on a 24×24 viewBox and filled with currentColor, so
 * it inherits the agent's deterministic hash color wherever it's drawn. Every
 * silhouette is chosen to stay readable as a solid shape at 18px on the map
 * (no strokes, no fine interior detail beyond a single cut).
 */

/** One glyph: subpaths on a 24×24 viewBox, filled with currentColor. */
export interface ModelGlyph {
  paths: string[];
  /** For glyphs with a cut (ring, crescent); default nonzero. */
  fillRule?: "evenodd";
}

// ── path builders (kept so shapes read as geometry, not opaque `d` blobs) ─────

/** Closed polygon from "x,y x,y …" points. */
const poly = (points: string): string => `M${points.trim().split(/\s+/).join(" L")} Z`;

/** Rounded rect; with r = h/2 (or w/2) it degenerates into a pill. */
const rrect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r}` +
  ` A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r}` +
  ` V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;

/** Full circle as two arcs. */
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`;

// ── the map ───────────────────────────────────────────────────────────────────

/**
 * Keyed by model family. Lookup goes through {@link glyphForModel}, which
 * matches real model strings ("claude-3-opus", "gpt-4o") by substring, family
 * keys before vendor keys — so "claude-3-opus" reads as opus, not claude.
 */
export const MODEL_GLYPHS: Record<string, ModelGlyph> = {
  // hexagon
  opus: { paths: [poly("12,2 21,7 21,17 12,22 3,17 3,7")] },
  // diamond
  sonnet: { paths: [poly("12,3 20,12 12,21 4,12")] },
  // three narrowing lines — a verse
  haiku: {
    paths: [rrect(4, 6, 16, 2.6, 1.3), rrect(6, 10.7, 12, 2.6, 1.3), rrect(8, 15.4, 8, 2.6, 1.3)],
  },
  // twin columns
  gemini: { paths: [rrect(6, 4, 4.2, 16, 2.1), rrect(13.8, 4, 4.2, 16, 2.1)] },
  // double chevron, sounding downward
  deepseek: {
    paths: [
      poly("4,6 12,12 20,6 20,9.2 12,15.2 4,9.2"),
      poly("6.5,12.5 12,16 17.5,12.5 17.5,15 12,18.5 6.5,15"),
    ],
  },
  // ring
  gpt: { paths: [circle(12, 12, 9), circle(12, 12, 4.6)], fillRule: "evenodd" },
  // four-point spark
  claude: { paths: [poly("12,2 14.4,9.6 22,12 14.4,14.4 12,22 9.6,14.4 2,12 9.6,9.6")] },
  // triangle
  llama: { paths: [poly("12,3.5 20.5,20 3.5,20")] },
  // ascending steps
  mistral: {
    paths: [rrect(4, 14.6, 5.4, 5.4, 1.2), rrect(9.3, 9.3, 5.4, 5.4, 1.2), rrect(14.6, 4, 5.4, 5.4, 1.2)],
  },
  // plus
  qwen: { paths: [rrect(9.9, 4, 4.2, 16, 2.1), rrect(4, 9.9, 16, 4.2, 2.1)] },
  // slash
  grok: { paths: [poly("15.4,3 19.4,3 8.6,21 4.6,21")] },
  // crescent (eccentric cut, thin edge to the upper right)
  kimi: { paths: [circle(12, 12, 9), circle(13.5, 10, 6.4)], fillRule: "evenodd" },
};

/**
 * Family keys before vendor keys, so a fully-qualified model string resolves to
 * its most specific mark ("claude-3-opus" → opus; plain "claude-…" → claude).
 */
const GLYPH_MATCH_ORDER = [
  "opus",
  "sonnet",
  "haiku",
  "gemini",
  "deepseek",
  "gpt",
  "llama",
  "mistral",
  "qwen",
  "grok",
  "kimi",
  "claude",
] as const;

/**
 * Glyph for a reported model, or null when the model is null/unrecognized —
 * callers fall back to the plain creature sprite. Exact key first, then
 * ordered substring match against the family keys.
 */
export function glyphForModel(model: string | null | undefined): ModelGlyph | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (MODEL_GLYPHS[m]) return MODEL_GLYPHS[m];
  for (const key of GLYPH_MATCH_ORDER) {
    if (m.includes(key)) return MODEL_GLYPHS[key];
  }
  return null;
}

// ── canvas ────────────────────────────────────────────────────────────────────

/** Client-only Path2D cache: one compiled path per glyph, built on first draw. */
const path2dCache = new WeakMap<ModelGlyph, Path2D>();

/** Compiled 24×24 Path2D for canvas drawing (translate/scale to place it). */
export function glyphPath2D(glyph: ModelGlyph): Path2D {
  let p = path2dCache.get(glyph);
  if (!p) {
    // Subpaths each start with M, so joining yields one multi-contour path.
    p = new Path2D(glyph.paths.join(" "));
    path2dCache.set(glyph, p);
  }
  return p;
}

// ── DOM ───────────────────────────────────────────────────────────────────────

/** Inline SVG rendition; sized by className, colored by currentColor. */
export function ModelGlyphIcon({ glyph, className }: { glyph: ModelGlyph; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {glyph.paths.map((d, i) => (
        <path key={i} d={d} fillRule={glyph.fillRule} clipRule={glyph.fillRule} />
      ))}
    </svg>
  );
}
