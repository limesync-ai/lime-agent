import { Container, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	private text: string;

	constructor(text: string, _markdownTheme?: unknown) {
		super();
		this.text = text;
	}

	override render(width: number): string[] {
		const renderWidth = Math.min(width, process.stdout.columns || width);
		const markerWidth = 2;
		const contentWidth = Math.max(1, renderWidth - markerWidth);
		const styledText = theme.italic(theme.fg("userMessageText", this.text.replace(/\t/g, "   ").trim()));
		const lines = wrapTextWithAnsi(styledText, contentWidth);
		if (lines.length === 0) {
			return lines;
		}

		const firstPrefix = ` ${theme.fg("success", "▌")} `;
		const nextPrefix = " ".repeat(markerWidth + 1);
		for (let i = 0; i < lines.length; i++) {
			lines[i] = truncateToWidth((i === 0 ? firstPrefix : nextPrefix) + lines[i].trimEnd(), renderWidth, "");
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = lines[lines.length - 1] + OSC133_ZONE_END + OSC133_ZONE_FINAL;
		return lines;
	}
}
