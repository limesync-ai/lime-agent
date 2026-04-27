/**
 * SGR mouse event parser for terminal mouse-tracking mode (1002/1006).
 *
 * Terminals send mouse events as CSI sequences:
 *   \x1b[<Cb;Cx;CyM   press or drag
 *   \x1b[<Cb;Cx;Cym   release
 *
 * Cb (button code):
 *   - bits 0-1: button id (0=left, 1=middle, 2=right)
 *   - bit 5 (32): drag
 *   - bit 6 (64): wheel (0=up, 1=down)
 *
 * Cx, Cy are 1-indexed column and row.
 */

export type MouseEventKind = "press" | "drag" | "release";

export interface ParsedMouseEvent {
	kind: MouseEventKind;
	/** 0 = left, 1 = middle, 2 = right, 64 = wheel-up, 65 = wheel-down. */
	button: number;
	/** 0-indexed screen row. */
	row: number;
	/** 0-indexed screen column. */
	col: number;
}

const MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;
const DRAG_BIT = 32;
const WHEEL_BIT = 64;

/**
 * Parse a single SGR mouse sequence. Returns null if the input isn't a mouse
 * event so the same listener can pass non-mouse data through unchanged.
 */
export function parseMouseEvent(seq: string): ParsedMouseEvent | null {
	const m = MOUSE_RE.exec(seq);
	if (!m) return null;
	const code = Number(m[1]);
	const x = Number(m[2]);
	const y = Number(m[3]);
	const action = m[4];

	const isWheel = (code & WHEEL_BIT) !== 0;
	const isDrag = (code & DRAG_BIT) !== 0;
	const button = isWheel ? WHEEL_BIT | (code & 0x3) : code & 0x3;

	let kind: MouseEventKind;
	if (action === "m") kind = "release";
	else if (isDrag) kind = "drag";
	else kind = "press";

	return { kind, button, row: y - 1, col: x - 1 };
}
