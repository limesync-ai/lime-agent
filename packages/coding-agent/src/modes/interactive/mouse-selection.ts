import * as fs from "node:fs";
import {
	NO_SELECT_LINE_PREFIX,
	NO_SELECT_ZONE_CLOSE,
	NO_SELECT_ZONE_OPEN,
	type ParsedMouseEvent,
	parseMouseEvent,
	type TUI,
	walkLineCells,
} from "@mariozechner/pi-tui";
import { copyToClipboard } from "../../utils/clipboard.js";

// Re-export so existing import sites (lime-splash, tests) continue to work.
export { NO_SELECT_LINE_PREFIX, NO_SELECT_ZONE_CLOSE, NO_SELECT_ZONE_OPEN };

/**
 * Zero-width OSC sentinel that marks a rendered line as a click target.
 * Format: `\x1b]9999;CT:<id>\x07`. Components that want to be clickable
 * (e.g. the thinking-block header) prepend this to their rendered line. On
 * mouse press, the selection layer scans the line under the cursor for the
 * marker and, on release without significant drag, fires the registered
 * handler instead of finalizing a text selection.
 */
const CLICK_TARGET_OSC_PREFIX = "\x1b]9999;CT:";
const CLICK_TARGET_OSC_SUFFIX = "\x07";
const CLICK_TARGET_RE = /\x1b\]9999;CT:([^\x07]+)\x07/;

export function clickTargetMarker(id: string): string {
	return `${CLICK_TARGET_OSC_PREFIX}${id}${CLICK_TARGET_OSC_SUFFIX}`;
}

const clickHandlers = new Map<string, () => void>();

/**
 * Register a click-target handler. Returns an unregister function. Components
 * should call the unregister fn when they are no longer reachable from the
 * UI tree (e.g. on disposal) to avoid stale handlers piling up across
 * streaming chunks and chat rebuilds.
 */
export function registerClickTarget(id: string, handler: () => void): () => void {
	clickHandlers.set(id, handler);
	return () => {
		// Only delete if still our handler — defensive against re-registers.
		if (clickHandlers.get(id) === handler) clickHandlers.delete(id);
	};
}

/**
 * Mouse-driven text selection for the interactive TUI. Built to mirror what
 * opentui (and therefore opencode) provide out of the box: capture mouse
 * events, draw a selection highlight on top of the rendered output, and on
 * mouse-up copy the underlying text via OSC 52. Whitespace cells (including
 * the U+2800 Braille blanks used as splash padding) are ignored, which is
 * what gives the "empty space cannot be selected" behaviour.
 *
 * This module is split into a pure-function half (highlight applicator and
 * text extractor — easy to unit-test) and a state-machine half (mouse
 * parser, lifecycle, render-interceptor wiring).
 */

/**
 * Anchor and head are SCREEN coordinates (0-indexed terminal row, 0-indexed
 * column), viewport-fixed. Content scrolling under the selection is fine —
 * the highlight stays put at the screen position; on mouse-up the text is
 * extracted from whatever is currently rendered at those screen cells.
 */
export interface SelectionRange {
	anchor: { row: number; col: number };
	head: { row: number; col: number };
}

interface NormalizedRange {
	startRow: number;
	startCol: number;
	endRow: number;
	endCol: number;
}

/**
 * The selection sentinel constants live in `@mariozechner/pi-tui` (re-exported
 * above) so generic widgets like the editor can mark parts of their output
 * non-selectable without depending on this module.
 *
 * Whitespace inside *selectable* content (spaces between words, indentation,
 * blank lines between messages) is intentionally NOT skipped — it would make
 * the selection bar visually break at every space. Trailing pad-whitespace
 * is trimmed from each row at extract time so over-dragging past end-of-line
 * doesn't pull column-fill spaces into the clipboard.
 */

function isNoSelect(line: string | undefined): boolean {
	return line?.startsWith(NO_SELECT_LINE_PREFIX) ?? false;
}

/** Reorder anchor/head so iteration is in reading order. */
function normalize(sel: SelectionRange): NormalizedRange {
	const { anchor, head } = sel;
	const reversed = anchor.row > head.row || (anchor.row === head.row && anchor.col > head.col);
	const start = reversed ? head : anchor;
	const end = reversed ? anchor : head;
	return { startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col };
}

/** Column range to highlight on a given row, given a selection. Returns null if the row is outside the selection. */
function colRangeForRow(row: number, n: NormalizedRange, width: number): { startCol: number; endCol: number } | null {
	if (row < n.startRow || row > n.endRow) return null;
	if (n.startRow === n.endRow) return { startCol: n.startCol, endCol: n.endCol };
	if (row === n.startRow) return { startCol: n.startCol, endCol: width };
	if (row === n.endRow) return { startCol: 0, endCol: n.endCol };
	return { startCol: 0, endCol: width };
}

/** A degenerate selection (zero cells) is treated the same as no selection. */
function isEmpty(sel: SelectionRange | null): boolean {
	if (!sel) return true;
	return sel.anchor.row === sel.head.row && sel.anchor.col === sel.head.col;
}

/**
 * Wrap each non-whitespace grapheme inside the selection rectangle with
 * `\x1b[7m … \x1b[27m` (inverse-video on/off). Per-grapheme wrapping is
 * deliberately verbose but byte-correct in the presence of OSC 8 hyperlinks,
 * OSC 133 prompt zone markers, and arbitrary nested SGR styling — all of
 * which pass through verbatim.
 */
export function applyHighlight(lines: string[], sel: SelectionRange | null, width: number, height: number): string[] {
	if (isEmpty(sel)) return lines;
	const n = normalize(sel as SelectionRange);
	// Screen-row → content-row translation: pi-tui pads `lines` to ≥ termHeight
	// and the bottom `height` slice is what's actually visible.
	const viewportTop = Math.max(0, lines.length - height);
	const maxScreenRow = Math.min(height - 1, lines.length - 1 - viewportTop);
	const firstScreenRow = Math.max(0, n.startRow);
	const lastScreenRow = Math.min(maxScreenRow, n.endRow);
	if (firstScreenRow > lastScreenRow) return lines;

	const result = lines.slice();
	for (let screenRow = firstScreenRow; screenRow <= lastScreenRow; screenRow++) {
		const range = colRangeForRow(screenRow, n, width);
		if (!range || range.startCol >= range.endCol) continue;
		const contentRow = screenRow + viewportTop;
		const original = result[contentRow];
		if (original === undefined) continue;
		// Decorative rows (splash, welcome text) opt out of selection entirely.
		if (isNoSelect(original)) continue;
		let out = "";
		// Per-row zone state: cells between OPEN and CLOSE are non-selectable
		// (e.g., the editor's `│` side walls).
		let inNoSelectZone = false;
		walkLineCells(original, (e) => {
			if (e.type === "ansi") {
				if (e.code === NO_SELECT_ZONE_OPEN) inNoSelectZone = true;
				else if (e.code === NO_SELECT_ZONE_CLOSE) inNoSelectZone = false;
				out += e.code;
				return;
			}
			// Wide-char boundary: include any grapheme whose START column lies
			// inside [startCol, endCol). Width can extend half a cell past the
			// boundary visually — better than silently dropping a CJK at the edge.
			// Spaces inside the range are highlighted too, so the selection bar
			// reads as a contiguous block instead of breaking at every space.
			const inRange = e.col >= range.startCol && e.col < range.endCol;
			if (inRange && !inNoSelectZone) {
				out += `\x1b[7m${e.grapheme}\x1b[27m`;
			} else {
				out += e.grapheme;
			}
		});
		result[contentRow] = out;
	}
	return result;
}

/**
 * Extract the text inside the selection rectangle. Whitespace cells are
 * skipped (no padding leaks into the clipboard). Rows are joined with `\n`.
 * ANSI / OSC sequences are dropped — the caller can hand the result straight
 * to `copyToClipboard()`.
 */
export function extractText(lines: string[], sel: SelectionRange | null, width: number, height: number): string {
	if (isEmpty(sel)) return "";
	const n = normalize(sel as SelectionRange);
	const viewportTop = Math.max(0, lines.length - height);
	const maxScreenRow = Math.min(height - 1, lines.length - 1 - viewportTop);
	const firstScreenRow = Math.max(0, n.startRow);
	const lastScreenRow = Math.min(maxScreenRow, n.endRow);

	const rows: string[] = [];
	for (let screenRow = firstScreenRow; screenRow <= lastScreenRow; screenRow++) {
		const range = colRangeForRow(screenRow, n, width);
		if (!range || range.startCol >= range.endCol) continue;
		const contentRow = screenRow + viewportTop;
		const original = lines[contentRow];
		if (original === undefined) continue;
		// Decorative rows (splash, welcome text) opt out of selection entirely.
		if (isNoSelect(original)) continue;
		let rowText = "";
		let inNoSelectZone = false;
		walkLineCells(original, (e) => {
			if (e.type === "ansi") {
				if (e.code === NO_SELECT_ZONE_OPEN) inNoSelectZone = true;
				else if (e.code === NO_SELECT_ZONE_CLOSE) inNoSelectZone = false;
				return;
			}
			const inRange = e.col >= range.startCol && e.col < range.endCol;
			if (inRange && !inNoSelectZone) {
				rowText += e.grapheme;
			}
		});
		// Trim trailing whitespace so dragging past end-of-line doesn't pull
		// in column-pad spaces; preserve leading whitespace (indentation).
		// Empty rows are kept so blank lines between messages survive the copy.
		rows.push(rowText.replace(/[\s⠀]+$/u, ""));
	}
	return rows.join("\n");
}

// ---------------------------------------------------------------------------
// MouseSelection — owns mouse capture lifecycle, state machine, render hook
// ---------------------------------------------------------------------------

const MOUSE_ENABLE = "\x1b[?1002h\x1b[?1006h";
const MOUSE_DISABLE = "\x1b[?1006l\x1b[?1002l\x1b[?25h";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

export class MouseSelection {
	private tui: TUI | null = null;
	private selection: SelectionRange | null = null;
	private dragging = false;
	private cursorHidden = false;
	private inputUnsubscribe: (() => void) | undefined;
	private lastTermWidth = 0;
	private lastTermHeight = 0;
	// Snapshot of pre-highlight rendered lines, captured each frame inside the
	// render interceptor. Used by `extractText` on mouse release.
	private lastRenderedLines: string[] = [];
	// Pending click-target. Set on press when the row contains a CT marker;
	// fired on release if the user didn't drag away.
	private pendingClickId: string | null = null;
	private pressRow = 0;
	private pressCol = 0;

	enable(tui: TUI): void {
		if (this.tui) return;
		this.tui = tui;

		process.stdout.write(MOUSE_ENABLE);

		this.inputUnsubscribe = tui.addInputListener((data) => {
			const ev = parseMouseEvent(data);
			if (!ev) return undefined;
			// When a modal overlay is open, pass mouse events through so the
			// overlay component can handle clicks / wheel scrolling itself.
			if (tui.hasOverlay()) {
				return undefined;
			}
			this.handleEvent(ev);
			return { consume: true };
		});

		tui.setRenderInterceptor((lines, width, height) => {
			// On any terminal-size change, drop the in-progress selection — its
			// screen coords are no longer meaningful.
			if (width !== this.lastTermWidth || height !== this.lastTermHeight) {
				if (this.lastTermWidth !== 0) {
					this.clearSelection();
				}
				this.lastTermWidth = width;
				this.lastTermHeight = height;
			}
			// Capture pre-highlight lines for text extraction on release.
			this.lastRenderedLines = lines;
			return applyHighlight(lines, this.selection, width, height);
		});
	}

	disable(): void {
		if (!this.tui) return;
		this.inputUnsubscribe?.();
		this.inputUnsubscribe = undefined;
		this.tui.setRenderInterceptor(undefined);
		// fs.writeSync — robust at exit; process.stdout.write may not flush.
		try {
			fs.writeSync(1, MOUSE_DISABLE);
		} catch {
			// best effort
		}
		this.tui = null;
		this.selection = null;
		this.dragging = false;
		this.cursorHidden = false;
	}

	private findClickTargetAtRow(screenRow: number): string | null {
		const viewportTop = Math.max(0, this.lastRenderedLines.length - this.lastTermHeight);
		const contentRow = screenRow + viewportTop;
		const line = this.lastRenderedLines[contentRow];
		if (!line) return null;
		const match = line.match(CLICK_TARGET_RE);
		return match ? (match[1] ?? null) : null;
	}

	private handleEvent(ev: ParsedMouseEvent): void {
		if (!this.tui) return;

		if (ev.button === 64 || ev.button === 65) {
			if (ev.kind === "press") {
				this.clearSelection();
				this.tui.scrollViewport(ev.button === 64 ? 3 : -3);
			}
			return;
		}

		// Right/middle-click: consumed so they don't leak to the editor.
		if (ev.button !== 0) return;

		if (ev.kind === "press") {
			this.pressRow = ev.row;
			this.pressCol = ev.col;

			// Click-target check: if this row hosts a registered click handler
			// (e.g., the thinking-block header), defer selection — release on
			// the same row/col will fire the handler instead.
			const clickId = this.findClickTargetAtRow(ev.row);
			if (clickId && clickHandlers.has(clickId)) {
				this.pendingClickId = clickId;
				this.dragging = false;
				this.selection = null;
				this.tui.requestRender();
				return;
			}

			if (!this.cursorHidden) {
				process.stdout.write(HIDE_CURSOR);
				this.cursorHidden = true;
			}
			this.selection = {
				anchor: { row: ev.row, col: ev.col },
				head: { row: ev.row, col: ev.col },
			};
			this.dragging = true;
			this.tui.requestRender();
			return;
		}

		if (ev.kind === "drag") {
			// If the user pressed on a click target and now drags far enough,
			// reinterpret as a text selection starting at the original press.
			if (this.pendingClickId !== null) {
				const drift = Math.abs(ev.row - this.pressRow) + Math.abs(ev.col - this.pressCol);
				if (drift >= 2) {
					this.pendingClickId = null;
					if (!this.cursorHidden) {
						process.stdout.write(HIDE_CURSOR);
						this.cursorHidden = true;
					}
					this.selection = {
						anchor: { row: this.pressRow, col: this.pressCol },
						head: { row: ev.row, col: ev.col },
					};
					this.dragging = true;
					this.tui.requestRender();
				}
				return;
			}
			if (!this.dragging || !this.selection) return;
			const clampedRow = Math.max(0, Math.min(this.lastTermHeight - 1, ev.row));
			const clampedCol = Math.max(0, Math.min(this.lastTermWidth - 1, ev.col));
			this.selection.head = { row: clampedRow, col: clampedCol };
			this.tui.requestRender();
			return;
		}

		// release
		if (this.pendingClickId !== null) {
			const handler = clickHandlers.get(this.pendingClickId);
			this.pendingClickId = null;
			if (handler) {
				handler();
				this.tui.requestRender();
			}
			return;
		}
		if (!this.dragging) return;
		this.dragging = false;
		if (this.selection && !isEmpty(this.selection)) {
			const text = extractText(this.lastRenderedLines, this.selection, this.lastTermWidth, this.lastTermHeight);
			if (text.length > 0) {
				// Fire-and-forget — we don't block rendering on clipboard I/O.
				copyToClipboard(text).catch(() => {
					// OSC 52 was emitted regardless; platform fallback failure is acceptable.
				});
			}
		}
		// Highlight persists until next press.
	}

	private clearSelection(): void {
		this.selection = null;
		this.dragging = false;
		if (this.cursorHidden) {
			process.stdout.write(SHOW_CURSOR);
			this.cursorHidden = false;
		}
	}
}
