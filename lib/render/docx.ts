// Markdown → branded .docx renderer for HD Reports client deliverables.
//
// Source of truth for the brand spec: .claude/skills/hd-phase2-reports/SKILL.md.
// Replicated here so the content pipeline (lib/report/foundation.ts) can hand
// off a validated markdown string and get back a Word document ready for the
// client. Keep the visual rules in lock-step with the skill — when one
// changes, change both.
//
// Brand:
//   - Font: Montserrat throughout
//   - Body: 11pt (size 22 in docx-js half-points), line 1.15 (276 twentieths)
//   - H1: 16pt bold purple #845095   (size 32)
//   - H2: 13pt bold purple #845095   (size 26)
//   - H3: 11pt bold gray   #333333   (size 22)
//   - Page: US Letter (12240 x 15840 twips), 1" margins (1440 twips)
//   - Header: right-aligned italic 9pt gray "[Client] | [Report Title]"
//   - Footer: centered page number 9pt gray
//
// Markdown subset handled (the set the Foundation report actually emits):
//   - `# H1`, `## H2`, `### H3`
//   - Paragraphs (one or more lines, blank-line separated)
//   - Bulleted lists (`- item` or `* item`)
//   - **bold** and *italic* inline runs
//   - `inline code` (rendered as italic — the report uses code-spans only for
//     bullet headers like `Gate 12: Standstill | D South Node 12.2 | Hanging`,
//     and italic reads cleaner in a client deliverable than monospace)
//   - `---` horizontal rule (rendered as a thin gray rule paragraph)
//
// Anything outside this subset (tables, images via ![]()`, links, fenced
// code blocks, etc.) is rendered as plain text. The Foundation pipeline
// doesn't currently emit those.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  PageNumber,
  Header,
  Footer,
  BorderStyle,
  TableOfContents,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  HorizontalPositionRelativeFrom,
  HorizontalPositionAlign,
  VerticalPositionRelativeFrom,
  VerticalPositionAlign,
  TextWrappingType,
  TextWrappingSide,
} from "docx";
import { Resvg } from "@resvg/resvg-js";
import { renderCompositeChartPng } from "@/lib/render/composite-chart";
import { brandAssets, centerImage, channelImage, readAsset } from "@/lib/render/assets";
import type { Chart } from "@/lib/chart/types";

// ─── Brand constants ────────────────────────────────────────────────────────
// Body font: Kaycee asked for "closer to the Montserrat family". Montserrat
// itself is the named target; Word substitutes a sans-serif fallback if the
// font isn't installed on the reader's machine. To keep the substitution
// graceful, we set "Montserrat" and trust the OS chain.
const FONT = "Montserrat";
const PURPLE = "845095";
const GRAY_DARK = "333333";
const GRAY_MID = "999999";
const CHARCOAL = "A8A8A9"; // brand secondary, used in the page header

// docx-js sizes are in half-points; line spacing is in twentieths of a point.
const SIZE_BODY = 20;     // 10pt — slightly tighter per Kaycee's review
const SIZE_H1 = 32;       // 16pt
const SIZE_H2 = 26;       // 13pt
const SIZE_H3 = 22;       // 11pt
const SIZE_SMALL = 18;    // 9pt
const SIZE_TITLE = 48;    // 24pt — only used on the cover page title

const LINE = 276;         // 1.15 line spacing
const PARA_AFTER = 200;
const BULLET_AFTER = 120;

// US Letter, narrow (0.5") margins per Kaycee's preference. Matches Word's
// "Narrow" preset. More usable area per page = better fit for sections
// like Profile + hexagram grid that need to land on a single page.
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const MARGIN = 720;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface RunSpec { text: string; bold?: boolean; italic?: boolean; }

function bodyRun(spec: RunSpec): TextRun {
  return new TextRun({
    text: spec.text,
    font: FONT,
    size: SIZE_BODY,
    bold: spec.bold,
    italics: spec.italic,
  });
}

function p(runs: RunSpec[], opts: { alignment?: typeof AlignmentType[keyof typeof AlignmentType] } = {}): Paragraph {
  // Body paragraphs are justified by default (Kaycee's brand spec); explicit
  // `opts.alignment` still wins for special cases (title page centering).
  return new Paragraph({
    spacing: { after: PARA_AFTER, line: LINE },
    alignment: opts.alignment ?? AlignmentType.JUSTIFIED,
    children: runs.map(bodyRun),
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 240 },
    children: [new TextRun({ text, font: FONT, size: SIZE_H1, bold: true, color: PURPLE })],
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 200 },
    children: [new TextRun({ text, font: FONT, size: SIZE_H2, bold: true, color: PURPLE })],
  });
}

// Heading with a right-floating image that body text wraps around.
//
// The image anchors to the heading paragraph. Word renders it floating in
// the right margin area of the section, with subsequent body text flowing
// around the LEFT side. That gives the magazine-style layout Kaycee asked
// for (vs. the previous 2-column table that strictly fixed the image
// beside the heading text only).
//
// Section images. New asset batch (5/25) is 3375×4219 portrait (~0.8 aspect)
// with the section label and a colored background baked in. Display larger
// per Kaycee's review — readable at print scale, fills the right margin
// nicely with wrapping body text on the left.
const FLOAT_SECTION_W = 240;   // px (≈ 2.5")
const FLOAT_SECTION_ASPECT = 4219 / 3375;

function floatingSectionImage(image: Buffer): ImageRun {
  return new ImageRun({
    data: image,
    transformation: {
      width: FLOAT_SECTION_W,
      height: Math.round(FLOAT_SECTION_W * FLOAT_SECTION_ASPECT),
    },
    type: "png",
    floating: {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.MARGIN,
        align: HorizontalPositionAlign.RIGHT,
      },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PARAGRAPH,
        align: VerticalPositionAlign.TOP,
      },
      wrap: {
        type: TextWrappingType.SQUARE,
        side: TextWrappingSide.LEFT,
      },
      margins: {
        // EMU units. 914400 EMU = 1 inch. Give the image a small left and
        // bottom margin so wrapped text doesn't hug it.
        left:   91440,  // 0.1"
        bottom: 91440,  // 0.1"
      },
    },
  });
}

function h2WithFloatingImage(text: string, image: Buffer): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 200 },
    children: [
      floatingSectionImage(image),
      new TextRun({ text, font: FONT, size: SIZE_H2, bold: true, color: PURPLE }),
    ],
  });
}

function h3WithFloatingImage(text: string, image: Buffer): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 160 },
    children: [
      floatingSectionImage(image),
      new TextRun({ text, font: FONT, size: SIZE_H3, bold: true, color: GRAY_DARK }),
    ],
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text, font: FONT, size: SIZE_H3, bold: true, color: GRAY_DARK })],
  });
}

function bullet(runs: RunSpec[]): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: BULLET_AFTER, line: LINE },
    alignment: AlignmentType.JUSTIFIED,
    children: runs.map(bodyRun),
  });
}

// Gate-bullet headers (centers section) follow the pattern:
//   <header with pipes>: <prose continues inline>
// where <header> is everything up to the colon AFTER the last pipe. Bolding
// the header makes each gate's metadata pop visually from its prose. Returns
// `null` when the bullet doesn't look like a gate bullet (regular bullet).
function splitGateBulletHeader(text: string): { header: string; rest: string } | null {
  const lastPipe = text.lastIndexOf("|");
  if (lastPipe === -1) return null;
  const colonAfterPipe = text.indexOf(":", lastPipe);
  if (colonAfterPipe === -1) return null;
  // Only treat as gate bullet if the line actually starts with "Gate " — keeps
  // the heuristic from firing on unrelated bullets that happen to have a pipe.
  if (!/^\s*Gate\s+\d+\b/.test(text)) return null;
  return {
    header: text.slice(0, colonAfterPipe).trim(),
    rest: text.slice(colonAfterPipe + 1).trim(),
  };
}

// A continuation paragraph that belongs to the bullet directly above it.
// In Markdown, this is the convention where an indented paragraph after a
// blank line is treated as part of the bullet item. In docx we render it
// with a left indent matching the bullet's text-column so it visually
// flows under the bullet rather than starting a new column-flush block.
//
// Indent values are in twentieths of a point (twips). 360 twips = 0.25"
// which matches the default bullet text indent at level 0.
function bulletContinuation(runs: RunSpec[]): Paragraph {
  return new Paragraph({
    spacing: { after: BULLET_AFTER, line: LINE },
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: 360 },
    children: runs.map(bodyRun),
  });
}

function hr(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { color: "CCCCCC", space: 1, style: BorderStyle.SINGLE, size: 6 },
    },
    spacing: { before: 200, after: 200 },
    children: [],
  });
}

// Hexagram grid table. Renders a 2-column borderless layout for the
// "How Your Profile Is Calculated" section: each row has up to two
// hexagrams side-by-side (Personality Sun + Personality Earth, then
// Design Sun + Design Earth in a second row), with caption beneath each.
//
// Hexagram image is loaded from sections/hexagrams/<gate>.<line>.png
// (e.g., 51.5.png) — the line-highlighted variant. Falls back to the
// base <gate>.png if the line variant is missing, and to no image at
// all if the gate itself is missing (caption renders alone).
function hexagramGridTable(entries: { gateLine: string; name: string; source: string }[]): Table {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
  const noBorders = {
    top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
    insideHorizontal: noBorder, insideVertical: noBorder,
  };

  // Cell builder for a single hexagram. Returns a TableCell with the
  // image stacked on top of the caption (gate-line + hexagram name + source).
  const buildCell = (e: { gateLine: string; name: string; source: string }) => {
    const img = readAsset(`sections/hexagrams/${e.gateLine}.png`)
            ?? readAsset(`sections/hexagrams/${e.gateLine.split(".")[0]}.png`);
    const children: Paragraph[] = [];
    if (img) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new ImageRun({
          data: img,
          transformation: { width: 140, height: 140 },
          type: "png",
        })],
      }));
    }
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [new TextRun({
        text: `Hexagram ${e.gateLine}: ${e.name}`,
        font: FONT, size: 18, color: GRAY_DARK,
      })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({
        text: e.source,
        font: FONT, size: 18, italics: true, color: GRAY_MID,
      })],
    }));
    return new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: noBorders,
      margins: { top: 100, bottom: 100, left: 100, right: 100 },
      children,
    });
  };

  // Pair entries into rows of two.
  const rows: TableRow[] = [];
  for (let i = 0; i < entries.length; i += 2) {
    const left = entries[i];
    const right = entries[i + 1];
    const cells = [buildCell(left)];
    if (right) cells.push(buildCell(right));
    else cells.push(new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: [new Paragraph({ children: [] })] }));
    rows.push(new TableRow({ children: cells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows,
  });
}

// Blockquote callout box. Rendered as a single-cell table with a soft purple
// background shading and a heavier left border in brand purple. This is what
// Kaycee called "the pretty formatted boxes" — used for Signature, Not-Self
// Theme, and any other "lift this paragraph visually" call-outs that come
// through the markdown as `> ...` lines.
function calloutBox(runs: RunSpec[]): Table {
  const purpleBorder = { style: BorderStyle.SINGLE, size: 24, color: PURPLE } as const;
  const noBorder    = { style: BorderStyle.NONE,   size: 0,  color: "FFFFFF" } as const;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: noBorder, bottom: noBorder, right: noBorder,
      left: purpleBorder,
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: "F0E6F2", color: "auto" },
        margins: { top: 200, bottom: 200, left: 300, right: 300 },
        borders: {
          top: noBorder, bottom: noBorder, right: noBorder,
          left: purpleBorder,
        },
        children: [new Paragraph({
          spacing: { after: 0, line: LINE },
          alignment: AlignmentType.JUSTIFIED,
          children: runs.map(bodyRun),
        })],
      })],
    })],
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// ─── Inline parser ──────────────────────────────────────────────────────────
// Handle **bold**, *italic*, and `code` (rendered as italic). Plain text is
// pass-through. We don't try to handle nested emphasis — the Foundation
// report doesn't emit any.
function parseInline(line: string): RunSpec[] {
  const runs: RunSpec[] = [];
  // Tokenize against the three delimiters. Use a single regex that captures
  // the entire delimited span so we can decide which formatting applies.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) runs.push({ text: line.slice(last, idx) });
    const tok = m[0];
    if (tok.startsWith("**")) {
      runs.push({ text: tok.slice(2, -2), bold: true });
    } else if (tok.startsWith("`")) {
      runs.push({ text: tok.slice(1, -1), italic: true });
    } else {
      runs.push({ text: tok.slice(1, -1), italic: true });
    }
    last = idx + tok.length;
  }
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.length ? runs : [{ text: line }];
}

// ─── Markdown block parser ──────────────────────────────────────────────────
// Walk the markdown line by line; each block produces one Paragraph (or, for
// H2/H3s that match a center/channel pattern with a corresponding image,
// a Paragraph carrying a right-floating image that body text wraps around).
// Full-width centered image paragraph. Used to slot in the Cross Mandala
// right after its section H1. Sized wide enough to read on Letter portrait
// but not so wide that it fights the page margins.
function fullWidthImageParagraph(png: Buffer): Paragraph {
  const W = 480; // pt (US Letter portrait minus generous margins)
  const H = 480; // square wheel
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new ImageRun({
      data: png,
      transformation: { width: W, height: H },
      type: "png",
    })],
  });
}

function markdownToParagraphs(md: string, opts: { crossMandalaPng?: Buffer } = {}): (Paragraph | Table)[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: (Paragraph | Table)[] = [];
  let i = 0;
  // When true, the NEXT heading we encounter (H1/H2/H3) will get a page
  // break inserted before it. Set after each center H3 and channel H2 so
  // the page break lands AFTER the section's content — which means group
  // H2s like "## Undefined Centers" stay attached to their first child
  // center on the same page, rather than orphaning at the bottom of the
  // previous page.
  let pendingBreak = false;
  const consumePendingBreak = () => {
    if (pendingBreak) { out.push(pageBreak()); pendingBreak = false; }
  };

  // Accumulate consecutive non-blank lines as one logical paragraph. Markdown
  // treats a hard line break inside a paragraph as a soft wrap; the report
  // doesn't depend on hard breaks within paragraphs.
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");

    if (line === "") { i++; continue; }

    // Explicit page break marker: a `<!-- pagebreak -->` HTML comment on
    // its own line inserts a page break. Used in Matt's .md after "How
    // to Use This Report" — sections do NOT auto-break before each H1
    // (previous attempt at auto-break was too aggressive).
    if (/^<!--\s*pagebreak\s*-->$/i.test(line)) {
      out.push(pageBreak());
      i++;
      continue;
    }

    // Blockquote → callout box. Markdown `> ...` lines collect into one
    // callout. Adjacent blockquote lines (no blank between) become one
    // box; a blank line ends the current box and starts a new one if
    // another blockquote follows.
    if (/^>\s?/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].replace(/\s+$/, ""))) {
        block.push(lines[i].replace(/\s+$/, "").replace(/^>\s?/, ""));
        i++;
      }
      out.push(calloutBox(parseInline(block.join(" "))));
      continue;
    }

    // Hexagram grid fenced block:
    //   ::: hexgrid
    //   51.5 | The Arousing | Personality Sun
    //   57.5 | The Gentle | Personality Earth
    //   :::
    // Renders as a 2-column borderless table with one hexagram per row.
    // Up to 2 hexagrams side-by-side per row (paired by the order they
    // appear). The image is `sections/hexagrams/<gate>.<line>.png` (or
    // base `<gate>.png` if line missing); caption shows hexagram name on
    // line 1 and source planet on line 2.
    if (/^:::\s*hexgrid\s*$/i.test(line)) {
      const entries: { gateLine: string; name: string; source: string }[] = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) {
        const r = lines[i].trim();
        if (r) {
          const parts = r.split("|").map((s) => s.trim());
          if (parts.length >= 3) {
            entries.push({ gateLine: parts[0], name: parts[1], source: parts[2] });
          }
        }
        i++;
      }
      if (i < lines.length) i++; // skip closing :::
      out.push(hexagramGridTable(entries));
      continue;
    }

    // Horizontal rules are stripped entirely. Per Kaycee: page breaks
    // between sections are handled automatically (before each new H1),
    // so the markdown's `---` rules add visual noise without function.
    if (/^---+$/.test(line) || /^___+$/.test(line) || /^\*\*\*+$/.test(line)) {
      i++;
      continue;
    }

    // Headings. Sections flow naturally; page breaks are explicit only
    // (via the `<!-- pagebreak -->` marker above) — EXCEPT each individual
    // center (H3) and each channel (H2) gets a page break AFTER it. The
    // pendingBreak flag enforces "after" semantics: we mark "break needed"
    // when emitting a center/channel, then flush the break before the
    // NEXT heading. That keeps group H2s ("Undefined Centers", etc.)
    // attached to their first child center on the same page.
    const m1 = /^# (.+)$/.exec(line);
    if (m1) {
      consumePendingBreak();
      const h1Text = m1[1].trim();
      out.push(h1(h1Text));
      // Cross H1 pattern: "{Cross Name} | ({gate}/{gate} | {gate}/{gate})".
      // lib/report/planetary.ts emits this exact shape so the renderer can
      // detect it here and drop the Cross Mandala image right after the
      // heading. If no PNG was supplied, this is a no-op — the heading
      // still renders, just without the wheel.
      if (opts.crossMandalaPng && /\|\s*\(\d+\s*\/\s*\d+\s*\|\s*\d+\s*\/\s*\d+\s*\)\s*$/.test(h1Text)) {
        out.push(fullWidthImageParagraph(opts.crossMandalaPng));
      }
      i++;
      continue;
    }
    // H2: channels live here as "## (10-57) The Channel of Perfected Form".
    // Flush any pending break before THIS heading (which gives "after the
    // previous center/channel" semantics). For a channel H2, ALSO mark a
    // break to be emitted before whatever heading comes next.
    const m2 = /^## (.+)$/.exec(line);
    if (m2) {
      const text = m2[1].trim();
      consumePendingBreak();
      const img = channelImage(text);
      out.push(img ? h2WithFloatingImage(text, img) : h2(text));
      const isChannel = /^\(\d+\s*-\s*\d+\)/.test(text);
      if (isChannel) pendingBreak = true;
      i++; continue;
    }
    // H3: individual centers live here as
    // "### Throat | Manifestation and Communication | Defined". Same
    // pending-break dance as channels — break AFTER each center, which
    // means the next H2 group header ("Undefined Centers") starts the
    // next page WITH its first child center attached.
    const m3 = /^### (.+)$/.exec(line);
    if (m3) {
      const text = m3[1].trim();
      consumePendingBreak();
      const img = centerImage(text);
      out.push(img ? h3WithFloatingImage(text, img) : h3(text));
      const isCenter = /\|\s*(Defined|Undefined|Open)\s*$/i.test(text);
      if (isCenter) pendingBreak = true;
      i++; continue;
    }

    // Bulleted list. For each bullet, also consume any "continuation"
    // paragraphs — indented prose that appears after a blank line and
    // belongs to the bullet item. Continuations render with a matching
    // left indent so they visually sit under the bullet's text column
    // (Kaycee's review: previous render had prose flush-left under the
    // bullet, which looked disconnected).
    if (/^\s*[-*]\s+/.test(line)) {
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, "");
        // Gate bullets: bold the metadata header up to the prose colon.
        const gate = splitGateBulletHeader(itemText);
        if (gate) {
          out.push(bullet([
            { text: gate.header, bold: true },
            { text: " " + gate.rest },
          ]));
        } else {
          out.push(bullet(parseInline(itemText)));
        }
        i++;
        // Look ahead for continuation paragraphs:
        //   1. zero or more blank lines
        //   2. a line indented by 2+ spaces (CommonMark convention)
        //   3. that line is NOT itself a new bullet
        while (i < lines.length) {
          let j = i;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j >= lines.length) break;
          const peek = lines[j];
          if (!/^  +\S/.test(peek)) break;             // not indented enough
          if (/^\s*[-*]\s+/.test(peek)) break;         // another bullet
          // Collect this continuation block (consecutive indented lines).
          const proseLines: string[] = [];
          let k = j;
          while (k < lines.length && lines[k].trim() !== "" && !/^\s*[-*]\s+/.test(lines[k]) && /^\s+\S/.test(lines[k])) {
            proseLines.push(lines[k].replace(/^\s+/, ""));
            k++;
          }
          if (proseLines.length === 0) break;
          out.push(bulletContinuation(parseInline(proseLines.join(" "))));
          i = k;
        }
      }
      continue;
    }

    // Plain paragraph — join until the next blank/heading/bullet/hr.
    const block: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i].replace(/\s+$/, "");
      if (next === "") break;
      if (/^#{1,6}\s/.test(next)) break;
      if (/^\s*[-*]\s+/.test(next)) break;
      if (/^---+$/.test(next) || /^___+$/.test(next) || /^\*\*\*+$/.test(next)) break;
      block.push(next);
      i++;
    }
    out.push(p(parseInline(block.join(" "))));
  }

  return out;
}

// ─── Title page ─────────────────────────────────────────────────────────────
// Renders the cover: the full Delphi composite chart (logo + bodygraph +
// planet tables + variables arrows + properties + tagline), followed by a
// page break. The composite is a single PNG built by composite-chart.ts.
// Birth date + place are inside the composite already, so we don't repeat
// them here.
//
// We strip the markdown front matter (Foundation report starts with a
// title block ending in `---`) so the body doesn't duplicate the cover.
interface TitlePageArgs {
  compositePng?: Buffer;
}

function titlePage(args: TitlePageArgs): (Paragraph | TableOfContents)[] {
  const ps: (Paragraph | TableOfContents)[] = [];

  // The composite is now 920×980 SVG pixels (aspect ≈ 0.939). With narrow
  // (0.5") margins, the page body is 7.5"×10" = 720×960 px. Width-fit at
  // 720 px (full body width), height ≈ 767 px (7.99"). Leaves ~2" of room
  // beneath the image for the cover footer to render visibly. Previous
  // taller-narrower version left too much horizontal whitespace.
  if (args.compositePng) {
    const imgW = 720;
    const imgH = Math.round(imgW * (980 / 920)); // = 767
    ps.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new ImageRun({
        data: args.compositePng,
        transformation: { width: imgW, height: imgH },
        type: "png",
      })],
    }));
  }

  // TOC removed (Kaycee's review). The Word TOC field shows as an empty
  // placeholder until the reader clicks "Update Field" — that made page 2
  // look blank in print/PDF export. Word's built-in Navigation Pane gives
  // the same jump-to-section affordance without the blank-page artifact.
  // If we add a TOC back later, pre-render the entries as static text
  // instead of using a live field.
  return ps;
}

// ─── Front matter strip ─────────────────────────────────────────────────────
// The Foundation markdown opens with optional metadata + a title block:
//   <!-- report: ... -->                ← optional metadata (HTML comment)
//   # Human Design Foundation Report    ← title H1
//   <Client Name>                       ← name line
//   Date of Birth: ...                  ← attribution
//   Place of Birth: ...                 ← attribution
//   # How to Use This Report            ← first body H1
//
// The composite cover already shows all of this visually, so we strip
// every line before the first body H1 (anything that ISN'T the title H1).
// Previously we relied on a `---` divider — that broke when Kaycee asked
// to remove horizontal rules from the source.
function stripFrontMatter(md: string): string {
  // Drop leading HTML comment (the metadata block) if present.
  let text = md.replace(/^<!--[\s\S]*?-->\s*/, "");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  // Find the first H1 that is NOT the title "Human Design Foundation Report".
  let bodyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^# (.+)$/.exec(lines[i].trim());
    if (m && !/^Human Design Foundations? Report$/i.test(m[1].trim())) {
      bodyStart = i;
      break;
    }
  }
  if (bodyStart === -1) return text;
  return lines.slice(bodyStart).join("\n").replace(/^\s+/, "");
}

// ─── SVG → PNG conversion ───────────────────────────────────────────────────
// docx-js needs raster image bytes. resvg-js renders SVG to PNG with no
// native dependencies on macOS/Linux. We request a 1200px-wide output and
// scale down to 400pt in the document — keeps the chart crisp on retina
// displays and on print.
export function svgToPng(svg: string, opts: { widthPx?: number } = {}): Buffer {
  const widthPx = opts.widthPx ?? 1200;
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
    background: "rgba(255,255,255,1)",
  });
  return resvg.render().asPng();
}

// ─── Public API ─────────────────────────────────────────────────────────────
export interface RenderArgs {
  markdown: string;
  clientName: string;
  reportTitle: string;           // e.g. "Human Design Analysis"
  chart?: Chart;                  // full Chart object — required for composite cover
  // Pass-through to composite. When present, the cover's "Defined /
  // Undefined / Open" centers list reflects the canonical status (the
  // Chart object alone can't distinguish undefined from open).
  dataPass?: import("@/lib/chart/datapass").DataPass;
  // Title used inside the composite cover (typically "Human Design
  // Foundations Report" to match Kaycee's bodygraph.com download). Falls
  // back to reportTitle if not set.
  compositeTitle?: string;
  // Cross Mandala PNG. When supplied, the renderer detects the Cross H1
  // pattern emitted by lib/report/planetary.ts ("{Cross Name} | (P/E | D/E)")
  // and inserts this image right after the heading. Optional — omit to
  // render without the wheel.
  crossMandalaPng?: Buffer;
  // Full Mandala PNG for the COVER. When supplied, this replaces the
  // default composite chart on the title page. Used by the Planetary
  // Overview (the full-chart mandala is Kaycee's canonical PO cover).
  coverMandalaPng?: Buffer;
}

export async function renderReportDocx(args: RenderArgs): Promise<Buffer> {
  // Build the composite cover only when we have BOTH the chart data and
  // the bodygraph SVG. Without those we'd produce an empty cover, which
  // is worse than skipping it.
  let compositePng: Buffer | undefined;
  if (args.chart?.chartImageSvg) {
    compositePng = renderCompositeChartPng({
      clientName: args.clientName,
      reportTitle: args.compositeTitle ?? "Human Design Foundations Report",
      chart: args.chart,
      bodygraphSvg: args.chart.chartImageSvg,
      dataPass: args.dataPass,
    });
  }

  // Defensive em-dash strip. The system prompt + LLM post-process already
  // catch em dashes from generated content, but manual edits to the .md
  // can reintroduce them. This last-mile sanitization guarantees no em
  // dash ever reaches a client deliverable, regardless of how it got into
  // the source. Per Kaycee: "NO EM DASHES EVER."
  const sanitized = args.markdown.replace(/—/g, ",");
  const bodyMarkdown = stripFrontMatter(sanitized);
  const bodyParagraphs = markdownToParagraphs(bodyMarkdown, { crossMandalaPng: args.crossMandalaPng });

  // Cover mandala overrides the composite bodygraph — Kaycee's canonical
  // Planetary Overview cover.
  const coverPng = args.coverMandalaPng ?? compositePng;
  const titleParagraphs = titlePage({ compositePng: coverPng });

  const doc = new Document({
    creator: "HD Reports",
    title: `${args.clientName} — ${args.reportTitle}`,
    description: `Human Design report for ${args.clientName}`,
    // updateFields stays on as a no-op safety; with the TOC removed there
    // aren't any fields to refresh, but other Word fields (page numbers
    // in the footer) still benefit from being auto-updated on open.
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE_BODY },
          paragraph: { spacing: { after: PARA_AFTER, line: LINE } },
        },
      },
    },
    sections: [{
      properties: {
        // titlePage: true tells Word to use the `first` header/footer on
        // page 1 and the `default` header/footer on every page after.
        // Kaycee's prior workflow had a Delphi logo header + "know thyself"
        // footer ONLY on the cover page; this restores that.
        titlePage: true,
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      headers: {
        // Page 1 (cover): Delphi logo, top-left. Uses the PNG from
        // ~/Desktop/Delphi Brand Assets/brand/delphi-logo.png when present,
        // falls back to a styled-text wordmark when missing.
        first: new Header({
          children: [(() => {
            const logo = brandAssets.delphiLogo();
            if (logo) {
              // New logo asset (5/25 update): 1.5"w × 0.75"h tight crop,
              // less top whitespace than the previous version. Display at
              // 144×72 px (= 1.5" × 0.75" at 96 DPI). Smaller footprint
              // gives the cover composite more breathing room.
              return new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { after: 0 },
                children: [new ImageRun({
                  data: logo,
                  transformation: { width: 144, height: 72 },
                  type: "png",
                })],
              });
            }
            return new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { after: 0 },
              children: [new TextRun({
                text: "DELPHI",
                font: FONT, size: 32, bold: true, color: PURPLE, characterSpacing: 60,
              })],
            });
          })(),
          ...(brandAssets.delphiLogo() ? [] : [new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [new TextRun({
              text: "Human Design",
              font: FONT, size: 16, bold: true, color: GRAY_DARK, characterSpacing: 30,
            })],
          })])],
        }),
        // Pages 2+: client | section | website, right-aligned.
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `${args.clientName}  |  Human Design Foundations  |  `,
                font: FONT, size: SIZE_SMALL, italics: true, color: CHARCOAL,
              }),
              new TextRun({
                text: "www.delphihd.com",
                font: FONT, size: SIZE_SMALL, italics: true, color: PURPLE,
              }),
            ],
          })],
        }),
      },
      footers: {
        // Page 1 (cover): "know thyself" tagline + website. Uses the PNG
        // from ~/Desktop/Delphi Brand Assets/brand/know-thyself.png when
        // present, falls back to styled text when missing.
        first: new Footer({
          children: [(() => {
            const kt = brandAssets.knowThyself();
            if (kt) {
              // knowthyself.png source is 3250×813 (aspect 4.0, wide
              // horizontal). Display at 280×70 px (≈ 2.92" × 0.73") to
              // preserve the source aspect.
              return new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [new ImageRun({
                  data: kt,
                  transformation: { width: 280, height: 70 },
                  type: "png",
                })],
              });
            }
            return new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0 },
              children: [new TextRun({
                text: "know thyself",
                font: FONT, size: 32, color: GRAY_DARK, characterSpacing: 100,
              })],
            });
          })(),
          ...(brandAssets.knowThyself() ? [] : [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
            children: [new TextRun({
              text: "www.delphihd.com",
              font: FONT, size: 16, color: GRAY_MID,
            })],
          })])],
        }),
        // Pages 2+: centered page number.
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              children: [PageNumber.CURRENT],
              font: FONT, size: SIZE_SMALL, color: GRAY_MID,
            })],
          })],
        }),
      },
      children: [...titleParagraphs, ...bodyParagraphs] as (Paragraph | TableOfContents | Table)[],
    }],
  });

  return await Packer.toBuffer(doc);
}
