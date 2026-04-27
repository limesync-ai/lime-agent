import { parseMouseEvent } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import {
	applyHighlight,
	extractText,
	NO_SELECT_LINE_PREFIX,
	NO_SELECT_ZONE_CLOSE,
	NO_SELECT_ZONE_OPEN,
	type SelectionRange,
} from "../src/modes/interactive/mouse-selection.js";

const HL = "\x1b[7m";
const HL_END = "\x1b[27m";
const W = 40; // synthetic terminal width
const H = 24; // synthetic terminal height

function range(anchorRow: number, anchorCol: number, headRow: number, headCol: number): SelectionRange {
	return { anchor: { row: anchorRow, col: anchorCol }, head: { row: headRow, col: headCol } };
}

describe("applyHighlight", () => {
	it("returns the input unchanged when there is no selection", () => {
		const lines = ["hello", "world"];
		expect(applyHighlight(lines, null, W, H)).toEqual(lines);
	});

	it("returns the input unchanged for a degenerate (zero-cell) selection", () => {
		const lines = ["hello"];
		expect(applyHighlight(lines, range(0, 2, 0, 2), W, H)).toEqual(lines);
	});

	it("wraps each non-whitespace grapheme inside a single-row selection", () => {
		const lines = ["hello world"];
		const out = applyHighlight(lines, range(0, 0, 0, 5), W, H);
		expect(out[0]).toBe(`${HL}h${HL_END}${HL}e${HL_END}${HL}l${HL_END}${HL}l${HL_END}${HL}o${HL_END} world`);
	});

	it("highlights spaces inside the selection so the bar is visually contiguous", () => {
		const lines = ["a b c"];
		const out = applyHighlight(lines, range(0, 0, 0, 5), W, H);
		expect(out[0]).toBe(`${HL}a${HL_END}${HL} ${HL_END}${HL}b${HL_END}${HL} ${HL_END}${HL}c${HL_END}`);
	});

	it("preserves OSC 8 hyperlink markers around selected link text", () => {
		const open = "\x1b]8;;https://example.com\x07";
		const close = "\x1b]8;;\x07";
		const lines = [`${open}link${close}`];
		const out = applyHighlight(lines, range(0, 0, 0, 4), W, H);
		// Hyperlink open/close pass through verbatim; each letter wrapped individually.
		expect(out[0]).toBe(`${open}${HL}l${HL_END}${HL}i${HL_END}${HL}n${HL_END}${HL}k${HL_END}${close}`);
	});

	it("preserves OSC 133 prompt zone markers (the user-message wrapping)", () => {
		const start = "\x1b]133;A\x07";
		const end = "\x1b]133;B\x07";
		const final = "\x1b]133;C\x07";
		const lines = [`${start}user${end}${final}`];
		const out = applyHighlight(lines, range(0, 0, 0, 4), W, H);
		expect(out[0]).toBe(`${start}${HL}u${HL_END}${HL}s${HL_END}${HL}e${HL_END}${HL}r${HL_END}${end}${final}`);
	});

	it("normalizes a reversed-direction drag (head before anchor)", () => {
		const lines = ["abcdef"];
		const forward = applyHighlight(lines, range(0, 1, 0, 4), W, H);
		const reversed = applyHighlight(lines, range(0, 4, 0, 1), W, H);
		expect(reversed).toEqual(forward);
	});

	it("handles multi-row selection: first row [start..eol], middle row full, last row [0..end]", () => {
		const lines = ["abcdef", "ghijkl", "mnopqr"];
		const out = applyHighlight(lines, range(0, 3, 2, 2), W, H);
		// Row 0: anchor col 3 → highlight 'd', 'e', 'f'
		expect(out[0]).toBe(`abc${HL}d${HL_END}${HL}e${HL_END}${HL}f${HL_END}`);
		// Row 1: full row highlighted
		expect(out[1]).toBe(`${HL}g${HL_END}${HL}h${HL_END}${HL}i${HL_END}${HL}j${HL_END}${HL}k${HL_END}${HL}l${HL_END}`);
		// Row 2: cols 0..1 highlighted (endCol exclusive)
		expect(out[2]).toBe(`${HL}m${HL_END}${HL}n${HL_END}opqr`);
	});

	it("does not modify rows outside the selection range", () => {
		const lines = ["row0", "row1", "row2"];
		const out = applyHighlight(lines, range(1, 0, 1, 4), W, H);
		expect(out[0]).toBe("row0");
		expect(out[2]).toBe("row2");
	});

	it("ignores selection screen rows outside the visible viewport", () => {
		// height 5 ⇒ visible screen rows are 0..4. Selection at screen row 10 is off-screen.
		const lines = Array.from({ length: 30 }, (_, i) => `row${i}`);
		const out = applyHighlight(lines, range(10, 0, 12, 3), W, 5);
		// Nothing should be highlighted anywhere — array unchanged.
		expect(out).toEqual(lines);
	});

	it("uses screen rows: when content overflows, selection at screen row 0 highlights the top of the visible viewport (which sits at the bottom of the lines array)", () => {
		// 30 content rows, height 5 ⇒ viewportTop = 25. Visible content is rows 25–29
		// shown at screen rows 0–4. A selection at screen rows 0–1 should highlight
		// the content at lines[25] and lines[26].
		const lines = Array.from({ length: 30 }, (_, i) => `row${i}`);
		const out = applyHighlight(lines, range(0, 0, 1, 5), W, 5);
		// Content rows 0–24 untouched.
		for (let i = 0; i < 25; i++) expect(out[i]).toBe(`row${i}`);
		// lines[25] (screen row 0): full row 0..W highlighted ⇒ "row25" wrapped per grapheme.
		expect(out[25]).toBe(`${HL}r${HL_END}${HL}o${HL_END}${HL}w${HL_END}${HL}2${HL_END}${HL}5${HL_END}`);
		// lines[26] (screen row 1, last selected row): cols 0..5 highlighted ⇒ "row26" wrapped.
		expect(out[26]).toBe(`${HL}r${HL_END}${HL}o${HL_END}${HL}w${HL_END}${HL}2${HL_END}${HL}6${HL_END}`);
		// Below the selected screen rows are untouched.
		expect(out[27]).toBe("row27");
	});

	it("skips rows that begin with the no-select sentinel (splash mascot, welcome text)", () => {
		const lines = [`${NO_SELECT_LINE_PREFIX}Welcome to Lime`, "user message"];
		const out = applyHighlight(lines, range(0, 0, 1, 12), W, H);
		// Splash row left untouched.
		expect(out[0]).toBe(lines[0]);
		// Chat row: every cell in the selection (including the space at col 4) wrapped.
		expect(out[1]).toBe(
			`${HL}u${HL_END}${HL}s${HL_END}${HL}e${HL_END}${HL}r${HL_END}${HL} ${HL_END}${HL}m${HL_END}${HL}e${HL_END}${HL}s${HL_END}${HL}s${HL_END}${HL}a${HL_END}${HL}g${HL_END}${HL}e${HL_END}`,
		);
	});

	it("skips cells inside an inline NO_SELECT zone but still highlights cells outside (editor side walls)", () => {
		// Mimics the editor: │hello│ where each `│` is wrapped in a zone.
		const O = NO_SELECT_ZONE_OPEN;
		const C = NO_SELECT_ZONE_CLOSE;
		const lines = [`${O}│${C}hello${O}│${C}`];
		const out = applyHighlight(lines, range(0, 0, 0, 7), W, H);
		// Walls (│) preserved verbatim; "hello" wrapped per grapheme.
		expect(out[0]).toBe(
			`${O}│${C}${HL}h${HL_END}${HL}e${HL_END}${HL}l${HL_END}${HL}l${HL_END}${HL}o${HL_END}${O}│${C}`,
		);
	});

	it("zone state resets per row (a missing CLOSE on one row does not leak to the next)", () => {
		const O = NO_SELECT_ZONE_OPEN;
		const lines = [`${O}unclosed`, "next row content"];
		const out = applyHighlight(lines, range(0, 0, 1, 16), W, H);
		// Row 0: zone opened at start, never closed — all cells inside zone, none highlighted.
		expect(out[0]).toBe(`${O}unclosed`);
		// Row 1: starts fresh, highlighted normally.
		expect(out[1]).toContain(HL);
	});

	it("highlights CJK width-2 graphemes once each", () => {
		const lines = ["你好世界"]; // each char width 2; total visible 8
		const out = applyHighlight(lines, range(0, 0, 0, 8), W, H);
		expect(out[0]).toBe(`${HL}你${HL_END}${HL}好${HL_END}${HL}世${HL_END}${HL}界${HL_END}`);
	});

	it("includes a wide-char grapheme whose start column is inside the range even if its width spills past endCol", () => {
		const lines = ["ab你cd"]; // "你" starts at col 2, occupies cols 2-3
		const out = applyHighlight(lines, range(0, 0, 0, 3), W, H);
		// "你" at col 2 is in range — highlight it whole.
		expect(out[0]).toBe(`${HL}a${HL_END}${HL}b${HL_END}${HL}你${HL_END}cd`);
	});
});

describe("extractText", () => {
	it("returns empty string when there is no selection", () => {
		expect(extractText(["hello"], null, W, H)).toBe("");
	});

	it("returns empty string for a zero-cell selection", () => {
		expect(extractText(["hello"], range(0, 2, 0, 2), W, H)).toBe("");
	});

	it("preserves spaces between words inside the selection (so 'hello world' copies intact)", () => {
		expect(extractText(["a b c"], range(0, 0, 0, 5), W, H)).toBe("a b c");
	});

	it("trims trailing whitespace per row so over-dragging past end-of-line doesn't pull pad spaces", () => {
		expect(extractText(["hello   "], range(0, 0, 0, 8), W, H)).toBe("hello");
	});

	it("preserves leading whitespace (indentation)", () => {
		expect(extractText(["    indented"], range(0, 0, 0, 12), W, H)).toBe("    indented");
	});

	it("strips ANSI / OSC sequences from the output", () => {
		const line = "\x1b]8;;https://example.com\x07link\x1b]8;;\x07";
		expect(extractText([line], range(0, 0, 0, 4), W, H)).toBe("link");
	});

	it("preserves blank lines between content rows (whitespace-only rows become empty rows)", () => {
		const lines = ["hello", "    ", "world"];
		expect(extractText(lines, range(0, 0, 2, 5), W, H)).toBe("hello\n\nworld");
	});

	it("normalizes a reversed-direction drag", () => {
		const forward = extractText(["abcdef"], range(0, 1, 0, 4), W, H);
		const reversed = extractText(["abcdef"], range(0, 4, 0, 1), W, H);
		expect(reversed).toBe(forward);
		expect(forward).toBe("bcd");
	});

	it("preserves CJK characters whose start column is inside the range", () => {
		expect(extractText(["ab你cd"], range(0, 0, 0, 3), W, H)).toBe("ab你");
	});

	it("trims trailing U+2800 (Braille blank) which is used as splash padding", () => {
		// Leading U+2800 is preserved (it's part of the selected range), trailing trimmed.
		expect(extractText(["⠀⠀hi⠀⠀"], range(0, 0, 0, 6), W, H)).toBe("⠀⠀hi");
	});

	it("skips rows marked with the no-select sentinel and only returns chat content", () => {
		const lines = [`${NO_SELECT_LINE_PREFIX}Welcome to Lime`, "user message"];
		// Splash row is silently elided (not even a blank line); chat row keeps its space.
		expect(extractText(lines, range(0, 0, 1, 12), W, H)).toBe("user message");
	});

	it("excludes cells inside an inline NO_SELECT zone from the extracted text", () => {
		const O = NO_SELECT_ZONE_OPEN;
		const C = NO_SELECT_ZONE_CLOSE;
		const lines = [`${O}│${C}hello${O}│${C}`];
		expect(extractText(lines, range(0, 0, 0, 7), W, H)).toBe("hello");
	});

	it("returns empty string when the entire selection is over no-select rows", () => {
		const lines = [
			`${NO_SELECT_LINE_PREFIX}mascot row 0`,
			`${NO_SELECT_LINE_PREFIX}mascot row 1`,
			`${NO_SELECT_LINE_PREFIX}mascot row 2`,
		];
		expect(extractText(lines, range(0, 0, 2, 12), W, H)).toBe("");
	});
});

describe("parseMouseEvent", () => {
	it("returns null for non-mouse input (so the listener can pass through)", () => {
		expect(parseMouseEvent("hello")).toBeNull();
		expect(parseMouseEvent("\x1b[A")).toBeNull(); // arrow key
		expect(parseMouseEvent("\x1b[200~paste\x1b[201~")).toBeNull();
	});

	it("decodes a left-button press at (col, row)", () => {
		// SGR uses 1-indexed (col, row) → return 0-indexed
		expect(parseMouseEvent("\x1b[<0;5;3M")).toEqual({ kind: "press", button: 0, col: 4, row: 2 });
	});

	it("decodes a left-button drag (bit 5 / 32 set)", () => {
		// 0 + 32 = 32 (drag with left button held)
		expect(parseMouseEvent("\x1b[<32;10;7M")).toEqual({ kind: "drag", button: 0, col: 9, row: 6 });
	});

	it("decodes a left-button release (action='m')", () => {
		expect(parseMouseEvent("\x1b[<0;5;3m")).toEqual({ kind: "release", button: 0, col: 4, row: 2 });
	});

	it("decodes scroll-wheel up (button code 64)", () => {
		expect(parseMouseEvent("\x1b[<64;1;1M")).toEqual({ kind: "press", button: 64, col: 0, row: 0 });
	});

	it("decodes scroll-wheel down (button code 65)", () => {
		expect(parseMouseEvent("\x1b[<65;1;1M")).toEqual({ kind: "press", button: 65, col: 0, row: 0 });
	});

	it("decodes right-click as button 2", () => {
		expect(parseMouseEvent("\x1b[<2;5;3M")).toEqual({ kind: "press", button: 2, col: 4, row: 2 });
	});

	it("strips modifier bits (shift/alt/ctrl) from the button id", () => {
		// shift (4) + ctrl (16) + left (0) = 20
		const ev = parseMouseEvent("\x1b[<20;5;3M");
		expect(ev?.button).toBe(0);
		expect(ev?.kind).toBe("press");
	});

	it("rejects malformed sequences with extra trailing bytes", () => {
		expect(parseMouseEvent("\x1b[<0;5;3Mextra")).toBeNull();
	});
});
