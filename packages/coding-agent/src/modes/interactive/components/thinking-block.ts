import { Container, Markdown, type MarkdownTheme, Text } from "@mariozechner/pi-tui";
import { clickTargetMarker, registerClickTarget } from "../mouse-selection.js";
import { theme } from "../theme/theme.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;

let nextThinkingBlockId = 0;

/**
 * A single, independently-collapsible thinking trace.
 *
 * Header reads `<icon> Thinking <chevron>`:
 *   - icon: braille spinner while streaming, ✓ when finalized
 *   - chevron: ▶ collapsed / ▼ expanded
 *
 * Default state: expanded while in-progress, auto-collapses on completion
 * unless the user has manually toggled this block (in which case their
 * preference wins). Mouse click on the header line toggles via the
 * mouse-selection click-target registry.
 */
export class ThinkingBlock extends Container {
	private readonly id: string;
	private readonly headerText: Text;
	private readonly contentContainer: Container;
	private readonly markdownTheme: MarkdownTheme;
	private thinkingText: string;
	private inProgress: boolean;
	private expanded: boolean;
	private userTouched = false;
	private readonly unregisterClick: () => void;

	constructor(thinkingText: string, inProgress: boolean, markdownTheme: MarkdownTheme) {
		super();
		this.id = `tb-${++nextThinkingBlockId}`;
		this.thinkingText = thinkingText;
		this.inProgress = inProgress;
		this.markdownTheme = markdownTheme;
		this.expanded = inProgress;

		// paddingX=0 so the icon (✓ / spinner) sits flush at column 0, lining
		// up with the green `┃` bar of user messages.
		this.headerText = new Text("", 0, 0);
		this.contentContainer = new Container();
		this.addChild(this.headerText);
		this.addChild(this.contentContainer);

		this.unregisterClick = registerClickTarget(this.id, () => this.toggle());

		this.refreshHeader();
		this.refreshContent();
	}

	setText(text: string): void {
		if (this.thinkingText === text) return;
		this.thinkingText = text;
		if (this.expanded) this.refreshContent();
	}

	setInProgress(inProgress: boolean): void {
		if (this.inProgress === inProgress) return;
		const wasInProgress = this.inProgress;
		this.inProgress = inProgress;
		// Auto-collapse on transition to finalized — but only if the user
		// hasn't already expressed a preference for this block. Honoring
		// their toggle avoids yanking the content out from under them.
		if (wasInProgress && !inProgress && !this.userTouched && this.expanded) {
			this.expanded = false;
			this.refreshContent();
		}
		this.refreshHeader();
	}

	setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) return;
		this.userTouched = true;
		this.expanded = expanded;
		this.refreshHeader();
		this.refreshContent();
	}

	private toggle(): void {
		this.userTouched = true;
		this.expanded = !this.expanded;
		this.refreshHeader();
		this.refreshContent();
	}

	override render(width: number): string[] {
		// Spinner is animated by the existing 80ms render-tick the working
		// loader drives during streaming — we just recompute the frame from
		// the wall clock on each render. No per-block setInterval needed.
		if (this.inProgress) this.refreshHeader();
		return super.render(width);
	}

	private refreshHeader(): void {
		const chevron = this.expanded ? "▼" : "▶";
		const glyph = this.inProgress
			? (SPINNER_FRAMES[Math.floor(Date.now() / FRAME_INTERVAL_MS) % SPINNER_FRAMES.length] ?? "⠋")
			: "✓";
		const icon = theme.fg("thinkingText", glyph);
		const label = theme.italic(theme.fg("thinkingText", "Thinking"));
		const chev = theme.fg("thinkingText", chevron);
		this.headerText.setText(`${clickTargetMarker(this.id)} ${icon} ${label} ${chev}`);
	}

	private refreshContent(): void {
		this.contentContainer.clear();
		if (this.expanded && this.thinkingText.trim()) {
			// paddingX=2 aligns content's first column with the "T" of
			// "Thinking" in the header (0 col padding + 1 col icon + 1 col
			// space). Hanging indent under the label, not under the icon.
			this.contentContainer.addChild(
				new Markdown(this.thinkingText.trim(), 2, 0, this.markdownTheme, {
					color: (text: string) => theme.fg("thinkingText", text),
					italic: true,
				}),
			);
		}
	}

	dispose(): void {
		this.unregisterClick();
	}
}
