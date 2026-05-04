import { type Component, visibleWidth } from "@mariozechner/pi-tui";
import { getEditorTheme } from "../theme/theme.js";

/**
 * Wraps a component in a rounded box with optional centered title — same
 * chrome the slash-command palette draws — so the second-level menus
 * (settings, model, tree, etc.) read as the same modal surface as the
 * palette instead of as inline editor swaps.
 *
 * Uses the editor theme's borderColor / paletteTitleColor (the bright-white
 * lime-agent box stroke + yellow palette title) rather than the generic
 * `theme.fg("border")` so first- and second-level modals match exactly.
 *
 * `targetHeight` (when supplied) pads the inner area with empty side-walled
 * rows so the modal renders at a fixed total row count regardless of how
 * many items the inner component produced. The slash palette and every
 * second-level selector share the same target so visually they read as one
 * stable surface.
 *
 * The selectors typically embed `DynamicBorder` children at top and bottom
 * for inline rendering; those would stack with the modal's own borders, so
 * leading/trailing all-dash lines are silently absorbed; mid-content
 * all-dash lines are turned into `├──┤` separators (matching the palette's
 * separator under its search input).
 */
export class ModalFrame implements Component {
	private borderColor: (s: string) => string;
	private headerTextColor: (s: string) => string;

	constructor(
		private inner: Component,
		private title?: string,
		private targetHeight?: () => number | undefined,
	) {
		const editorTheme = getEditorTheme();
		this.borderColor = editorTheme.borderColor;
		this.headerTextColor = editorTheme.borderColor;
	}

	invalidate(): void {
		this.inner.invalidate?.();
	}

	handleInput(data: string): void {
		this.inner.handleInput?.(data);
	}

	render(width: number): string[] {
		const innerWidth = Math.max(1, width - 2);
		let innerLines = this.inner.render(innerWidth);
		if (innerLines.length > 0 && isHorizontalRule(innerLines[0]!)) {
			innerLines = innerLines.slice(1);
		}
		if (innerLines.length > 0 && isHorizontalRule(innerLines[innerLines.length - 1]!)) {
			innerLines = innerLines.slice(0, -1);
		}

		const out: string[] = [];
		const titleStr = this.title ? ` ${this.title} ` : "";
		const titleW = visibleWidth(titleStr);
		if (titleStr && titleW + 2 <= width) {
			const leftPad = Math.floor((innerWidth - titleW) / 2);
			const rightPad = innerWidth - leftPad - titleW;
			out.push(
				this.borderColor("╭") +
					this.borderColor("─".repeat(leftPad)) +
					this.headerTextColor(titleStr) +
					this.borderColor("─".repeat(rightPad)) +
					this.borderColor("╮"),
			);
		} else {
			out.push(this.borderColor("╭") + this.borderColor("─".repeat(innerWidth)) + this.borderColor("╮"));
		}

		for (const line of innerLines) {
			if (isHorizontalRule(line)) {
				out.push(this.borderColor("├") + this.borderColor("─".repeat(innerWidth)) + this.borderColor("┤"));
				continue;
			}
			const lineW = visibleWidth(line);
			const padding = " ".repeat(Math.max(0, innerWidth - lineW));
			out.push(this.borderColor("│") + line + padding + this.borderColor("│"));
		}

		// Pad with empty side-walled rows so the modal renders at a fixed
		// total row count regardless of inner content length.
		const target = this.targetHeight?.();
		if (target && target > 0) {
			// out currently holds top border + inner rows. Reserve one row for
			// the bottom border before padding.
			const blank = this.borderColor("│") + " ".repeat(innerWidth) + this.borderColor("│");
			while (out.length < target - 1) {
				out.push(blank);
			}
		}

		out.push(this.borderColor("╰") + this.borderColor("─".repeat(innerWidth)) + this.borderColor("╯"));

		return out;
	}
}

const ANSI_CSI_RE = /\x1b\[[0-9;]*m/g;

function isHorizontalRule(line: string): boolean {
	const stripped = line.replace(ANSI_CSI_RE, "").trim();
	return stripped.length > 0 && /^─+$/.test(stripped);
}
