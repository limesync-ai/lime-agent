/**
 * Lime UI defaults: static "mascot" splash, tab strip widget, and minimal
 * footer. Built into the lime-agent fork as the default TUI chrome.
 *
 * The splash is a small ASCII creature drawn once — no animation. If you ever
 * want to swap the mascot, just edit the CREATURE array below.
 */

import { type Component, visibleWidth } from "@mariozechner/pi-tui";
import { theme } from "./theme/theme.js";

/**
 * Cute kawaii cat, `(=◕.◕=)` style scaled to 10 rows. Each line is
 * space-padded to the same visual width so the rendered column stays aligned.
 */
const CREATURE: string[] = [
	"        /\\_______/\\        ",
	"       /           \\       ",
	"      /             \\      ",
	"     (=   ◕     ◕   =)     ",
	"      |       .      |     ",
	"       \\      v      /     ",
	"        )           (      ",
	"       (             )     ",
	"        \\___________/      ",
	'        (")_________(")     ',
];

function padToWidth(lines: string[]): { padded: string[]; width: number } {
	const width = Math.max(...lines.map((l) => visibleWidth(l)));
	const padded = lines.map((l) => l + " ".repeat(width - visibleWidth(l)));
	return { padded, width };
}

function buildSplashFrame(termWidth: number): string[] {
	const { padded: creature, width: creatureWidth } = padToWidth(CREATURE);
	const creatureH = creature.length;

	// Welcome text sits to the right of the creature, roughly aligned to its
	// vertical midline. With a 6-row creature we want three blocks: the
	// greeting, the command hint, and the attach / interrupt tip.
	const welcome: (string | null)[] = new Array(creatureH).fill(null);
	const at = (row: number, line: string) => {
		if (row >= 0 && row < creatureH) welcome[row] = line;
	};
	// Welcome text aligns with the cat's vertical midline for a centered
	// composition — greeting next to ears, hint next to face, attach tips
	// next to body.
	at(1, "Welcome to Lime");
	at(3, `Press ${theme.fg("accent", "/")} for commands, ${theme.fg("accent", "!")} to run a shell command`);
	at(7, `Drop files or paste with ${theme.fg("accent", "Ctrl+V")} to attach,`);
	at(8, `${theme.fg("accent", "Ctrl+C")} to interrupt at any time`);

	const GAP = "    ";
	const welcomeWidth = Math.max(...welcome.map((l) => (l ? visibleWidth(l) : 0)));
	const contentWidth = creatureWidth + GAP.length + welcomeWidth;
	const leftPad = " ".repeat(Math.max(0, Math.floor((termWidth - contentWidth) / 2)));

	const out: string[] = [];
	// Sit the creature a bit above vertical centre so the editor has room.
	const termRows = process.stdout.rows || 40;
	const desiredTopBlank = Math.max(3, Math.floor(termRows * 0.4) - Math.floor(creatureH / 2));
	for (let i = 0; i < desiredTopBlank; i++) out.push("");
	for (let i = 0; i < creatureH; i++) {
		const line = theme.fg("accent", creature[i]);
		const right = welcome[i] ?? "";
		out.push(leftPad + line + GAP + right);
	}

	// Pin the editor near the bottom: pad this header with blank lines so the
	// total content above the editor consumes the rest of the screen.
	const EDITOR_RESERVE = 7;
	const targetLines = Math.max(out.length + 1, termRows - EDITOR_RESERVE);
	while (out.length < targetLines) out.push("");
	return out;
}

/** Legacy name kept for external callers that still import it. */
export function buildLimeSplashLines(termWidth: number): string[] {
	return buildSplashFrame(termWidth);
}

/**
 * Static splash component used as the built-in header. No animation, no
 * timers — just the mascot + welcome text, rendered once on every re-layout.
 */
export class LimeSplashHeader implements Component {
	render(width: number): string[] {
		return buildSplashFrame(width);
	}

	/** No-op — kept so upstream event hooks that call `pulse()` don't throw. */
	pulse(_amount = 1): void {}

	invalidate(): void {}

	dispose(): void {}
}

/**
 * Right-aligned tab strip floating just above the editor's top border.
 * Hardcoded labels for now; wire to real preset/skill-count later.
 */
export class LimeTabsWidget implements Component {
	render(width: number): string[] {
		const rush = theme.fg("accent", "rush");
		const skills = theme.fg("text", "53-skills");
		const dash = theme.fg("dim", "─");
		const tab = `${dash}${rush}${dash}${skills}${dash}`;
		const pad = Math.max(0, width - visibleWidth(tab) - 2);
		return [" ".repeat(pad) + tab];
	}
	invalidate(): void {}
}

export function buildLimeFooterLine(): string {
	return theme.fg("dim", "? for shortcuts");
}
