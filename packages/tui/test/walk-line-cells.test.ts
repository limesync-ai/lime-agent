import assert from "node:assert";
import { describe, it } from "node:test";
import { type LineCellEvent, walkLineCells } from "../src/utils.js";

function collect(line: string): LineCellEvent[] {
	const events: LineCellEvent[] = [];
	walkLineCells(line, (e) => events.push(e));
	return events;
}

function graphemes(events: LineCellEvent[]): { col: number; width: number; grapheme: string }[] {
	return events.flatMap((e) => (e.type === "grapheme" ? [{ col: e.col, width: e.width, grapheme: e.grapheme }] : []));
}

function ansi(events: LineCellEvent[]): string[] {
	return events.flatMap((e) => (e.type === "ansi" ? [e.code] : []));
}

function reconstruct(events: LineCellEvent[]): string {
	let out = "";
	for (const e of events) out += e.type === "ansi" ? e.code : e.grapheme;
	return out;
}

describe("walkLineCells", () => {
	it("yields one event per ASCII character with monotonic columns", () => {
		const events = collect("hello");
		assert.deepStrictEqual(graphemes(events), [
			{ col: 0, width: 1, grapheme: "h" },
			{ col: 1, width: 1, grapheme: "e" },
			{ col: 2, width: 1, grapheme: "l" },
			{ col: 3, width: 1, grapheme: "l" },
			{ col: 4, width: 1, grapheme: "o" },
		]);
		assert.deepStrictEqual(ansi(events), []);
	});

	it("treats CJK characters as width 2 and advances the column accordingly", () => {
		const events = collect("你好");
		assert.deepStrictEqual(graphemes(events), [
			{ col: 0, width: 2, grapheme: "你" },
			{ col: 2, width: 2, grapheme: "好" },
		]);
	});

	it("keeps emoji ZWJ sequences as a single width-2 grapheme", () => {
		const events = collect("👨‍💻x");
		const g = graphemes(events);
		assert.strictEqual(g.length, 2);
		assert.strictEqual(g[0]!.grapheme, "👨‍💻");
		assert.strictEqual(g[0]!.width, 2);
		assert.strictEqual(g[0]!.col, 0);
		assert.strictEqual(g[1]!.col, 2);
	});

	it("emits OSC 8 hyperlink open + close as ansi events flanking the visible text", () => {
		const open = "\x1b]8;;https://example.com\x07";
		const close = "\x1b]8;;\x07";
		const line = `${open}link${close}`;
		const events = collect(line);
		assert.deepStrictEqual(ansi(events), [open, close]);
		assert.deepStrictEqual(
			graphemes(events).map((g) => g.grapheme),
			["l", "i", "n", "k"],
		);
		// First grapheme begins at col 0 — OSC 8 doesn't consume visual columns.
		assert.strictEqual(graphemes(events)[0]!.col, 0);
		// Reconstructing must yield the original line byte-for-byte.
		assert.strictEqual(reconstruct(events), line);
	});

	it("emits OSC 133 prompt zone markers as ansi events without affecting columns", () => {
		const start = "\x1b]133;A\x07";
		const end = "\x1b]133;B\x07";
		const final = "\x1b]133;C\x07";
		const line = `${start}user${end}${final}`;
		const events = collect(line);
		assert.deepStrictEqual(ansi(events), [start, end, final]);
		const g = graphemes(events);
		assert.deepStrictEqual(
			g.map((x) => x.grapheme),
			["u", "s", "e", "r"],
		);
		assert.deepStrictEqual(
			g.map((x) => x.col),
			[0, 1, 2, 3],
		);
		assert.strictEqual(reconstruct(events), line);
	});

	it("preserves SGR sequences as ansi events between graphemes", () => {
		const line = "\x1b[31mred\x1b[0m\x1b[1mbold\x1b[22m";
		const events = collect(line);
		assert.deepStrictEqual(ansi(events), ["\x1b[31m", "\x1b[0m", "\x1b[1m", "\x1b[22m"]);
		assert.deepStrictEqual(
			graphemes(events).map((g) => g.grapheme),
			["r", "e", "d", "b", "o", "l", "d"],
		);
		assert.strictEqual(reconstruct(events), line);
	});

	it("treats U+2800 Braille blank as a regular width-1 grapheme (the splash padding char)", () => {
		const events = collect("⠀⠀hi⠀⠀");
		const g = graphemes(events);
		assert.deepStrictEqual(
			g.map((x) => ({ col: x.col, width: x.width, grapheme: x.grapheme })),
			[
				{ col: 0, width: 1, grapheme: "⠀" },
				{ col: 1, width: 1, grapheme: "⠀" },
				{ col: 2, width: 1, grapheme: "h" },
				{ col: 3, width: 1, grapheme: "i" },
				{ col: 4, width: 1, grapheme: "⠀" },
				{ col: 5, width: 1, grapheme: "⠀" },
			],
		);
	});

	it("returns no events for an empty string", () => {
		assert.deepStrictEqual(collect(""), []);
	});

	it("emits a stray ESC byte as a zero-width grapheme without infinite-looping", () => {
		const events = collect("\x1bxyz");
		const g = graphemes(events);
		assert.strictEqual(g[0]!.grapheme, "\x1b");
		assert.strictEqual(g[0]!.width, 0);
		assert.deepStrictEqual(
			g.slice(1).map((x) => x.grapheme),
			["x", "y", "z"],
		);
	});

	it("byte-exact round-trip across mixed ANSI / OSC 133 / wide chars / Braille", () => {
		const line =
			"\x1b]133;A\x07\x1b[1m" + "你好 " + "\x1b]8;;https://x\x07link\x1b]8;;\x07" + "⠀!\x1b[0m\x1b]133;B\x07";
		const events = collect(line);
		assert.strictEqual(reconstruct(events), line);
	});
});
